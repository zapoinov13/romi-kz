#!/usr/bin/env node
/**
 * ROMI WhatsApp Web daemon (Baileys multi-device).
 * Polls /api/wa-web-bridge with x-wa-web-key, keeps sockets open, QR + ingest.
 *
 * Env:
 *   WA_WEB_BRIDGE_URL  default https://romi-kz.vercel.app/api/wa-web-bridge
 *   WA_WEB_WORKER_KEY  required
 *   WA_WEB_POLL_MS     default 2500
 */
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode";
import { Boom } from "@hapi/boom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import pino from "pino";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = (process.env.WA_WEB_BRIDGE_URL || "https://romi-kz.vercel.app/api/wa-web-bridge").replace(/\/$/, "");
const KEY = process.env.WA_WEB_WORKER_KEY || "";
const POLL_MS = Number(process.env.WA_WEB_POLL_MS) || 2500;
const SESSIONS_DIR = path.join(__dirname, "sessions");
const LID_MAP_PATH = path.join(__dirname, "lid-map.json");
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
// Storage uploads require a privileged key: the crm-chat-media bucket is private
// and anonymous writes are not allowed.
const SUPABASE_STORAGE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const log = pino({ level: process.env.LOG_LEVEL || "info" });

if (!KEY) {
  console.error("WA_WEB_WORKER_KEY is required");
  process.exit(1);
}

fs.mkdirSync(SESSIONS_DIR, { recursive: true });

/** @type {Map<string, { sock: any, projectId: string, connecting?: boolean }>} */
const sockets = new Map();

function loadLidMap() {
  try {
    return JSON.parse(fs.readFileSync(LID_MAP_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveLidMap(map) {
  fs.writeFileSync(LID_MAP_PATH, JSON.stringify(map, null, 2));
}

function rememberLid(lid, phoneDigits) {
  if (!lid || !phoneDigits) return;
  const map = loadLidMap();
  map[lid] = phoneDigits;
  saveLidMap(map);
}

function resolveLid(lid) {
  const map = loadLidMap();
  return map[lid] || null;
}

async function bridge(action, body = {}) {
  const res = await fetch(BRIDGE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-wa-web-key": KEY,
    },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `bridge ${action} HTTP ${res.status}`);
  }
  return json;
}

function jidToPhone(jid) {
  if (!jid || typeof jid !== "string") return null;
  if (jid.includes("@lid") || jid.includes("@g.us") || jid.includes("@broadcast")) return null;
  const user = jid.split("@")[0] || "";
  const num = user.split(":")[0] || "";
  const d = num.replace(/\D/g, "");
  // WhatsApp LID locals are often 13+ digits / start with 80 — not dialable.
  if (d.length < 8 || d.length > 12 || d.startsWith("80")) return null;
  return d;
}

function jidToLid(jid) {
  if (!jid || !String(jid).includes("@lid")) return null;
  return (String(jid).split("@")[0] || "").split(":")[0] || null;
}

/** Prefer real PN over WhatsApp LID (linked id). */
function resolveMessagePhone(projectId, msg, sock = null) {
  const key = msg?.key || {};
  const candidates = [
    key.remoteJidAlt,
    key.participantAlt,
    key.senderPn,
    key.participantPn,
    key.remoteJid,
    key.participant,
  ];
  let lid =
    jidToLid(key.remoteJid) ||
    jidToLid(key.participant) ||
    jidToLid(key.senderLid) ||
    jidToLid(key.remoteJidAlt) ||
    null;
  for (const jid of candidates) {
    const phone = jidToPhone(String(jid || ""));
    if (phone) {
      if (lid) rememberLid(lid, phone);
      return { phone, lid };
    }
  }
  if (lid) {
    const mapped = resolveLid(lid);
    if (mapped) return { phone: mapped, lid };
    // Baileys internal LID↔PN map (when available)
    try {
      const mapping = sock?.signalRepository?.lidMapping;
      const pnJid =
        mapping?.getPNForLID?.( `${lid}@lid`) ||
        mapping?.getPNForLID?.(lid) ||
        null;
      const phone = jidToPhone(String(pnJid || ""));
      if (phone) {
        rememberLid(lid, phone);
        return { phone, lid };
      }
    } catch {
      /* ignore */
    }
  }
  return { phone: null, lid };
}

async function ffmpegToM4a(inputBuf) {
  const tmpIn = path.join(__dirname, `.tmp-${Date.now()}.ogg`);
  const tmpOut = path.join(__dirname, `.tmp-${Date.now()}.m4a`);
  fs.writeFileSync(tmpIn, inputBuf);
  try {
    await new Promise((resolve, reject) => {
      const p = spawn("ffmpeg", ["-y", "-i", tmpIn, "-c:a", "aac", "-b:a", "64k", tmpOut], {
        stdio: "ignore",
      });
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
    });
    return fs.readFileSync(tmpOut);
  } finally {
    try { fs.unlinkSync(tmpIn); } catch { /* */ }
    try { fs.unlinkSync(tmpOut); } catch { /* */ }
  }
}

/** Upload media from VPS → Supabase Storage (avoids Vercel body size limit). */
async function uploadChatMedia(projectId, buf, mime, filename) {
  if (!SUPABASE_URL || !SUPABASE_STORAGE_KEY) {
    log.warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing - cannot upload media from daemon");
    return null;
  }
  if (!buf?.length) return null;
  const safe = String(filename || "file").replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const objectPath = `${projectId}/${Date.now()}-${safe}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/crm-chat-media/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_STORAGE_KEY,
      Authorization: `Bearer ${SUPABASE_STORAGE_KEY}`,
      "Content-Type": mime || "application/octet-stream",
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    log.warn({ status: res.status, errText: errText.slice(0, 200) }, "storage upload failed");
    return null;
  }
  return `${SUPABASE_URL}/storage/v1/object/public/crm-chat-media/${objectPath}`;
}

async function openSocket(projectId, { forcePair = false } = {}) {
  const existing = sockets.get(projectId);
  if (existing?.sock && !forcePair) return existing.sock;
  if (existing?.connecting && !forcePair) return null;

  const authDir = path.join(SESSIONS_DIR, projectId);
  if (forcePair) {
    fs.rmSync(authDir, { recursive: true, force: true });
  }
  fs.mkdirSync(authDir, { recursive: true });

  sockets.set(projectId, { sock: null, projectId, connecting: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    syncFullHistory: true,
    markOnlineOnConnect: false,
    getMessage: async () => undefined,
  });

  sockets.set(projectId, { sock, projectId, connecting: false });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    try {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        const dataUrl = await qrcode.toDataURL(qr, { margin: 1, width: 320 });
        await bridge("push_qr", { project_id: projectId, qr_data: dataUrl });
        log.info({ projectId }, "QR pushed");
      }
      if (connection === "open") {
        const me = sock.user?.id || "";
        const phone = jidToPhone(me);
        await bridge("set_state", {
          project_id: projectId,
          status: "connected",
          phone: phone ? `+${phone}` : null,
          display_name: sock.user?.name || null,
          last_error: null,
        });
        const entry = sockets.get(projectId) || {};
        sockets.set(projectId, { ...entry, sock, projectId, connecting: false });
        log.info({ projectId, phone }, "connected");
      }
      if (connection === "close") {
        const code = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output?.statusCode
          : lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        // 515 = restartRequired — normal right after QR scan / pairing.
        const restartRequired = code === DisconnectReason.restartRequired || code === 515;
        sockets.delete(projectId);
        if (loggedOut) {
          await bridge("set_state", {
            project_id: projectId,
            status: "disconnected",
            last_error: "logged_out",
          }).catch(() => null);
          log.warn({ projectId }, "logged out");
        } else if (restartRequired) {
          // Do NOT mark disconnected — UI would spin forever / lose QR flow.
          log.info({ projectId, code }, "restart required — reconnecting");
          setTimeout(() => {
            openSocket(projectId).catch((e) => log.error({ err: e, projectId }, "reconnect after 515"));
          }, 1500);
        } else {
          log.warn({ projectId, code }, "connection closed — retry soon");
          setTimeout(() => {
            openSocket(projectId).catch((e) => log.error({ err: e, projectId }, "reconnect"));
          }, 4000);
        }
      }
    } catch (e) {
      log.error({ err: e, projectId }, "connection.update handler");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    log.info({ projectId, type, count: messages?.length || 0 }, "messages.upsert");
    for (const msg of messages || []) {
      try {
        await handleIncoming(projectId, sock, msg);
      } catch (e) {
        log.error({ err: e, projectId }, "ingest message failed");
      }
    }
  });

  sock.ev.on("contacts.upsert", (contacts) => {
    for (const c of contacts || []) {
      try {
        const id = c.id || c.lid;
        const pn = jidToPhone(String(c.phoneNumber || c.id || ""));
        if (id && String(id).includes("@lid") && pn) rememberLid(jidToLid(id), pn);
        if (c.id && c.lid) {
          const lid = jidToLid(c.lid) || String(c.lid).replace(/\D/g, "");
          const phone = jidToPhone(c.id);
          if (lid && phone) rememberLid(lid, phone);
        }
      } catch {
        /* ignore */
      }
    }
  });

  sock.ev.on("contacts.update", (updates) => {
    for (const c of updates || []) {
      try {
        if (c.id && c.lid) {
          const lid = jidToLid(c.lid) || String(c.lid).replace(/\D/g, "");
          const phone = jidToPhone(c.id);
          if (lid && phone) rememberLid(lid, phone);
        }
        if (c.lid && c.phoneNumber) {
          const lid = jidToLid(c.lid) || String(c.lid).replace(/\D/g, "");
          const phone = jidToPhone(String(c.phoneNumber));
          if (lid && phone) rememberLid(lid, phone);
        }
      } catch {
        /* ignore */
      }
    }
  });

  sock.ev.on("chats.phoneNumberShare", ({ lid, jid }) => {
    try {
      const lidLocal = jidToLid(lid) || String(lid || "").replace(/\D/g, "");
      const phone = jidToPhone(String(jid || ""));
      if (lidLocal && phone) rememberLid(lidLocal, phone);
    } catch {
      /* ignore */
    }
  });

  // Catch-up history after linking (cap to avoid flooding CRM).
  sock.ev.on("messaging-history.set", async (payload) => {
    const messages = payload?.messages || [];
    log.info({ projectId, count: messages.length }, "messaging-history.set");
    const recent = messages.slice(-100);
    for (const msg of recent) {
      try {
        await handleIncoming(projectId, sock, msg);
      } catch (e) {
        log.error({ err: e, projectId }, "history ingest failed");
      }
    }
  });

  return sock;
}

async function handleIncoming(projectId, sock, msg) {
  if (!msg?.key) return;
  if (!msg?.message || msg.message.protocolMessage || msg.message.reactionMessage) return;

  const fromMe = !!msg.key.fromMe;
  const remote = msg.key.remoteJid || "";
  if (remote.endsWith("@g.us") || remote.endsWith("@broadcast") || remote === "status@broadcast") return;

  const { phone, lid } = resolveMessagePhone(projectId, msg, sock);
  if (!phone && !lid) {
    log.warn({
      projectId,
      remoteJid: msg.key?.remoteJid,
      remoteJidAlt: msg.key?.remoteJidAlt,
      senderPn: msg.key?.senderPn,
      participantPn: msg.key?.participantPn,
      senderLid: msg.key?.senderLid,
    }, "skip message: no phone/lid");
    return;
  }

  const externalId = msg.key.id || null;
  let text = "";
  const m = msg.message || {};
  if (m.conversation) text = m.conversation;
  else if (m.extendedTextMessage?.text) text = m.extendedTextMessage.text;
  else if (m.imageMessage) text = m.imageMessage.caption || "[Фото]";
  else if (m.videoMessage) text = m.videoMessage.caption || "[Видео]";
  else if (m.audioMessage) text = "[Аудио]";
  else if (m.documentMessage) text = m.documentMessage.fileName || "[Документ]";
  else if (m.stickerMessage) text = "[Стикер]";
  else if (m.contactMessage) text = "[Контакт]";
  else if (m.locationMessage) text = "[Геолокация]";
  else text = "[Сообщение]";
  if (!text) return;

  /** @type {Record<string, unknown>} */
  const payload = {
    project_id: projectId,
    direction: fromMe ? "out" : "in",
    text,
    external_id: externalId,
    phone: phone || undefined,
    whatsapp_lid: lid || undefined,
    from: remote,
    name: msg.pushName || null,
  };

  // Media (best-effort) — upload on VPS, pass URL (not base64) to bridge
  try {
    const hasMedia =
      m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage || m.stickerMessage;
    if (hasMedia) {
      let buf = await downloadMediaMessage(msg, "buffer", {}, {
        logger: pino({ level: "silent" }),
        reuploadRequest: sock.updateMediaMessage,
      });
      let mime =
        m.imageMessage?.mimetype ||
        m.videoMessage?.mimetype ||
        m.audioMessage?.mimetype ||
        m.documentMessage?.mimetype ||
        m.stickerMessage?.mimetype ||
        "application/octet-stream";
      let kind = m.imageMessage
        ? "image"
        : m.videoMessage
          ? "video"
          : m.audioMessage
            ? "audio"
            : m.stickerMessage
              ? "image"
              : "document";
      let filename =
        m.documentMessage?.fileName ||
        (kind === "audio"
          ? "voice.m4a"
          : kind === "video"
            ? "video.mp4"
            : kind === "image"
              ? "image.jpg"
              : "file.bin");

      if (kind === "audio" && (mime.includes("ogg") || mime.includes("opus"))) {
        try {
          buf = await ffmpegToM4a(buf);
          mime = "audio/mp4";
          filename = "voice.m4a";
        } catch (e) {
          log.warn({ err: e }, "ffmpeg convert failed, sending original");
        }
      }

      if (buf && Buffer.isBuffer(buf) && buf.length > 0 && buf.length < 16 * 1024 * 1024) {
        const url = await uploadChatMedia(projectId, buf, mime, filename);
        payload.media_kind = kind;
        payload.media_mime = mime;
        payload.media_filename = filename;
        if (url) {
          payload.media_url = url;
          log.info({ projectId, kind, bytes: buf.length }, "media uploaded");
        } else {
          // Fallback for small files only (Vercel body limit ~4.5MB)
          if (buf.length < 2.5 * 1024 * 1024) {
            payload.media_base64 = buf.toString("base64");
          } else {
            log.warn({ projectId, kind, bytes: buf.length }, "media upload failed and too large for base64 fallback");
          }
        }
      }
    }
  } catch (e) {
    log.warn({ err: e }, "media download skipped");
  }

  const res = await bridge("ingest", payload);
  log.info({
    projectId,
    phone: phone || null,
    lid: lid || null,
    direction: fromMe ? "out" : "in",
    externalId,
    leadId: res.lead_id || null,
    skipped: res.skipped || false,
    reason: res.reason || null,
    deduped: res.deduped || false,
    mediaUrl: res.media_url || payload.media_url || null,
    mediaKind: payload.media_kind || null,
  }, "ingested");
}

async function closeSocket(projectId, wipeAuth = false) {
  const entry = sockets.get(projectId);
  if (entry?.sock) {
    try {
      await entry.sock.logout();
    } catch {
      try { entry.sock.end?.(undefined); } catch { /* */ }
    }
  }
  sockets.delete(projectId);
  if (wipeAuth) {
    const authDir = path.join(SESSIONS_DIR, projectId);
    fs.rmSync(authDir, { recursive: true, force: true });
  }
}

async function handleCommand(cmd) {
  const projectId = cmd.project_id;
  const action = cmd.action;
  try {
    if (action === "pair") {
      await closeSocket(projectId, false);
      await openSocket(projectId, { forcePair: true });
      await bridge("ack", { command_id: cmd.id, status: "done", result: { ok: true } });
      return;
    }
    if (action === "logout") {
      await closeSocket(projectId, true);
      await bridge("set_state", { project_id: projectId, status: "disconnected" });
      await bridge("ack", { command_id: cmd.id, status: "done", result: { ok: true } });
      return;
    }
    if (action === "send") {
      const phone = String(cmd.payload?.phone || "").replace(/\D/g, "");
      const text = String(cmd.payload?.text || "");
      if (!phone || !text) throw new Error("phone/text required");
      let sock = sockets.get(projectId)?.sock;
      if (!sock) sock = await openSocket(projectId);
      if (!sock) throw new Error("socket connecting, retry");
      const jid = `${phone}@s.whatsapp.net`;
      const sent = await sock.sendMessage(jid, { text });
      const wamid = sent?.key?.id || null;
      await bridge("ingest", {
        project_id: projectId,
        direction: "out",
        text,
        phone,
        external_id: wamid,
        from: jid,
      });
      await bridge("ack", {
        command_id: cmd.id,
        status: "done",
        result: { wamid },
      });
      return;
    }
    await bridge("ack", { command_id: cmd.id, status: "failed", result: { error: "unknown action" } });
  } catch (e) {
    await bridge("ack", {
      command_id: cmd.id,
      status: "failed",
      result: { error: e instanceof Error ? e.message : String(e) },
    }).catch(() => null);
  }
}

async function tick() {
  await bridge("heartbeat", {});
  const { sessions } = await bridge("list_sessions", {});
  const needed = new Set((sessions || []).map((s) => s.project_id));

  for (const projectId of needed) {
    const entry = sockets.get(projectId);
    if (!entry?.sock && !entry?.connecting) {
      try {
        await openSocket(projectId);
      } catch (e) {
        log.error({ err: e, projectId }, "openSocket");
        await bridge("set_state", {
          project_id: projectId,
          status: "error",
          last_error: e instanceof Error ? e.message : String(e),
        }).catch(() => null);
      }
    }
  }

  // Close sockets for projects no longer pairing/connected
  for (const projectId of [...sockets.keys()]) {
    if (!needed.has(projectId)) {
      await closeSocket(projectId, false);
    }
  }

  const { commands } = await bridge("claim", { limit: 20 });
  for (const cmd of commands || []) {
    await handleCommand(cmd);
  }
}

async function loop() {
  log.info({ bridge: BRIDGE }, "wa-web daemon started");
  for (;;) {
    try {
      await tick();
    } catch (e) {
      log.error({ err: e }, "tick failed");
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop();
