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

const log = pino({ level: process.env.LOG_LEVEL || "info" });

if (!KEY) {
  console.error("WA_WEB_WORKER_KEY is required");
  process.exit(1);
}

fs.mkdirSync(SESSIONS_DIR, { recursive: true });

/** @type {Map<string, { sock: any, projectId: string }>} */
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
  return d.length >= 8 && d.length <= 15 ? d : null;
}

function jidToLid(jid) {
  if (!jid || !String(jid).includes("@lid")) return null;
  return (String(jid).split("@")[0] || "").split(":")[0] || null;
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

async function openSocket(projectId) {
  if (sockets.has(projectId)) return sockets.get(projectId).sock;

  const authDir = path.join(SESSIONS_DIR, projectId);
  fs.mkdirSync(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sockets.set(projectId, { sock, projectId });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    try {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        const dataUrl = await qrcode.toDataURL(qr);
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
        });
        log.info({ projectId, phone }, "connected");
      }
      if (connection === "close") {
        const code = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output?.statusCode
          : lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        sockets.delete(projectId);
        await bridge("set_state", {
          project_id: projectId,
          status: "disconnected",
          last_error: loggedOut ? "logged_out" : `close_${code ?? "unknown"}`,
        }).catch(() => null);
        log.warn({ projectId, code }, "socket closed");
        if (!loggedOut) {
          // will reopen on next list_sessions if still pairing/connected
        }
      }
    } catch (e) {
      log.error({ err: e, projectId }, "connection.update handler");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;
    for (const msg of messages) {
      try {
        await handleIncoming(projectId, sock, msg);
      } catch (e) {
        log.error({ err: e, projectId }, "ingest message failed");
      }
    }
  });

  sock.ev.on("contacts.upsert", (contacts) => {
    for (const c of contacts || []) {
      const lid = jidToLid(c.id);
      const pn = jidToPhone(c.id) || jidToPhone(c.notify) || null;
      // Baileys may expose lid + phone via other fields in future
      if (lid && pn) rememberLid(lid, pn);
    }
  });

  return sock;
}

async function handleIncoming(projectId, sock, msg) {
  if (!msg?.key) return;
  const fromMe = !!msg.key.fromMe;
  const remote = msg.key.remoteJid || "";
  if (remote.endsWith("@g.us") || remote.endsWith("@broadcast")) return;

  let phone = jidToPhone(remote);
  let lid = jidToLid(remote);

  // Alternative PN on some messages
  const alt = msg.key.remoteJidAlt || msg.key.participantAlt || msg.senderPn;
  if (!phone && alt) phone = jidToPhone(String(alt));
  if (lid && !phone) phone = resolveLid(lid);
  if (lid && phone) rememberLid(lid, phone);

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

  // Media (best-effort)
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
        (kind === "audio" ? "voice.m4a" : kind === "image" ? "image.jpg" : "file.bin");

      if (kind === "audio" && (mime.includes("ogg") || mime.includes("opus"))) {
        try {
          buf = await ffmpegToM4a(buf);
          mime = "audio/mp4";
          filename = "voice.m4a";
        } catch (e) {
          log.warn({ err: e }, "ffmpeg convert failed, sending original");
        }
      }

      if (buf && Buffer.isBuffer(buf) && buf.length < 11 * 1024 * 1024) {
        payload.media_base64 = buf.toString("base64");
        payload.media_mime = mime;
        payload.media_kind = kind;
        payload.media_filename = filename;
      }
    }
  } catch (e) {
    log.warn({ err: e }, "media download skipped");
  }

  await bridge("ingest", payload);
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
      await closeSocket(projectId, true);
      await openSocket(projectId);
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
    if (!sockets.has(projectId)) {
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
      // keep connected sockets if still in map but not listed — list only pairing|connected
      // so closing others is correct
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
