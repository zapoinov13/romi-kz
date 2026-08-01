/**
 * WhatsApp Web bridge (Baileys daemon ↔ CRM).
 * POST { action, ... } with either:
 *  - Authorization: Bearer <user JWT>  → status | start_pair | logout | send
 *  - x-wa-web-key: <WA_WEB_WORKER_KEY> → heartbeat | list_sessions | push_qr | set_state | claim | ack | ingest
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Body = Record<string, unknown>;

function cors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, x-wa-web-key, apikey, x-client-info",
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}




/** Service-role client — worker RPC + chat media storage (never exposed to clients). */
function adminDb(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function workerKey(): string {
  return process.env.WA_WEB_WORKER_KEY?.trim() ?? "";
}

function workerKeyOk(req: VercelRequest): boolean {
  const expected = workerKey();
  if (!expected) return false;
  const got = String(req.headers["x-wa-web-key"] ?? "").trim();
  return !!got && got === expected;
}

async function workerRpc(action: string, body: Body): Promise<Record<string, unknown>> {
  const db = adminDb();
  const { data, error } = await db.rpc("wa_web_worker", {
    p_key: workerKey(),
    p_action: action,
    p_body: body,
  });
  if (error) throw new Error(error.message);
  return (data ?? { ok: true }) as Record<string, unknown>;
}

function digits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** Personal WA phone from JID / digits. Rejects @lid and groups. */
function normalizeWaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.includes("@lid") || s.includes("@g.us") || s.includes("@broadcast")) return null;
  const base = (s.split("@")[0] ?? s).split(":")[0] ?? s;
  const d = digits(base);
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

function extractLid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s.includes("@lid")) return null;
  const id = (s.split("@")[0] ?? "").split(":")[0];
  return id || null;
}

async function firstStageNew(db: SupabaseClient, pipelineId: string): Promise<string | null> {
  const { data: byKey } = await db
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .eq("key", "new")
    .maybeSingle();
  if (byKey?.id) return byKey.id;
  const { data } = await db
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function getDefaultStage(db: SupabaseClient, projectId: string) {
  const { data: d1 } = await db
    .from("pipelines")
    .select("id")
    .eq("project_id", projectId)
    .eq("is_default", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (d1?.id) {
    const sid = await firstStageNew(db, d1.id);
    if (sid) return { pipeline_id: d1.id, stage_id: sid };
  }
  const { data: d2 } = await db
    .from("pipelines")
    .select("id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (d2?.id) {
    const sid = await firstStageNew(db, d2.id);
    if (sid) return { pipeline_id: d2.id, stage_id: sid };
  }
  return null;
}

async function findLeadId(
  db: SupabaseClient,
  projectId: string,
  phoneDigits: string | null,
  lid: string | null,
): Promise<string | null> {
  if (lid) {
    const { data } = await db
      .from("leads")
      .select("id")
      .eq("project_id", projectId)
      .eq("whatsapp_lid", lid)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  if (!phoneDigits) return null;
  const phone = `+${phoneDigits}`;
  const { data: existing } = await db
    .from("leads")
    .select("id, phone")
    .eq("project_id", projectId)
    .or(`phone.eq.${phone},phone.eq.${phoneDigits},phone.eq.+${phoneDigits}`)
    .limit(1);
  if (existing?.[0]?.id) return existing[0].id;
  return null;
}

async function findOrCreateLead(opts: {
  db: SupabaseClient;
  projectId: string;
  phoneDigits: string | null;
  lid: string | null;
  name?: string | null;
  createIfMissing: boolean;
}): Promise<string | null> {
  const existing = await findLeadId(opts.db, opts.projectId, opts.phoneDigits, opts.lid);
  if (existing) {
    if (opts.lid) {
      await opts.db.from("leads").update({ whatsapp_lid: opts.lid }).eq("id", existing);
    }
    return existing;
  }
  if (!opts.createIfMissing || !opts.phoneDigits) return null;

  let stage = await getDefaultStage(opts.db, opts.projectId);
  if (!stage) {
    try {
      await opts.db.rpc("ensure_project_pipeline", { p_project_id: opts.projectId });
    } catch {
      /* ignore */
    }
    stage = await getDefaultStage(opts.db, opts.projectId);
  }
  if (!stage) return null;

  const { data: proj } = await opts.db
    .from("projects")
    .select("created_by")
    .eq("id", opts.projectId)
    .maybeSingle();
  const ownerId = (proj as { created_by?: string | null } | null)?.created_by ?? null;
  const displayName = (opts.name ?? "").trim() || `+${opts.phoneDigits}`;

  const { data: created, error } = await opts.db
    .from("leads")
    .insert({
      name: displayName,
      phone: `+${opts.phoneDigits}`,
      whatsapp_lid: opts.lid,
      source: "whatsapp",
      channel: "whatsapp",
      project_id: opts.projectId,
      pipeline_id: stage.pipeline_id,
      stage_id: stage.stage_id,
      created_by: ownerId,
      assigned_to: ownerId,
    })
    .select("id")
    .single();

  if (error) {
    return await findLeadId(opts.db, opts.projectId, opts.phoneDigits, opts.lid);
  }
  return created?.id ?? null;
}

async function ensureSession(db: SupabaseClient, projectId: string) {
  const { data } = await db
    .from("whatsapp_web_sessions")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (data) return data;
  const { data: created, error } = await db
    .from("whatsapp_web_sessions")
    .insert({ project_id: projectId, status: "disconnected" })
    .select("*")
    .single();
  if (error) throw error;
  return created;
}

async function userClient(req: VercelRequest): Promise<{
  db: SupabaseClient;
  userId: string;
  authHeader: string;
} | { error: string; status: number }> {
  const authHeader = String(req.headers.authorization ?? "");
  if (!authHeader.startsWith("Bearer ")) {
    return { error: "Unauthorized", status: 401 };
  }
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return { error: "Server misconfigured", status: 500 };

  const userDb = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error } = await userDb.auth.getUser();
  if (error || !userData.user) return { error: "Unauthorized", status: 401 };
  // User-scoped client (RLS) — no service_role needed on Lovable projects.
  return { db: userDb, userId: userData.user.id, authHeader };
}

async function canAccessProject(db: SupabaseClient, userId: string, projectId: string) {
  try {
    const { data: roleOk } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (roleOk === true) return true;
  } catch {
    /* ignore */
  }
  try {
    const { data } = await db.rpc("user_can_access_project", { p_project_id: projectId });
    if (data === true) return true;
  } catch {
    /* ignore */
  }
  const { data: proj } = await db
    .from("projects")
    .select("id, created_by")
    .eq("id", projectId)
    .maybeSingle();
  if ((proj as { created_by?: string } | null)?.created_by === userId) return true;
  const { data: mem } = await db
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!mem;
}

function workerOnline(heartbeat: string | null | undefined): boolean {
  if (!heartbeat) return false;
  const t = new Date(heartbeat).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 90_000;
}

async function uploadMedia(
  db: SupabaseClient,
  projectId: string,
  opts: {
    base64?: string;
    mime?: string;
    filename?: string;
    kind?: string;
  },
): Promise<{ url: string; kind: string; mime: string; filename: string } | null> {
  if (!opts.base64) return null;
  const mime = opts.mime || "application/octet-stream";
  const kind = opts.kind || "document";
  const filename = opts.filename || `file-${Date.now()}`;
  const buf = Buffer.from(opts.base64, "base64");
  if (buf.length > 11 * 1024 * 1024) return null;
  const path = `${projectId}/${Date.now()}-${filename.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await db.storage.from("crm-chat-media").upload(path, buf, {
    contentType: mime,
    upsert: false,
  });
  if (error) {
    console.error("media upload", error.message);
    return null;
  }
  const { data } = db.storage.from("crm-chat-media").getPublicUrl(path);
  return { url: data.publicUrl, kind, mime, filename };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, hint: "POST { action } to /api/wa-web-bridge" });
  }

  const body = (req.body ?? {}) as Body;
  const action = String(body.action ?? "").trim();
  if (!action) return res.status(400).json({ error: "action required" });

  try {
    // ── Worker actions (RPC, no service_role) ───────────────────
    if (workerKeyOk(req)) {
      if (action === "ingest") {
        const projectId = String(body.project_id ?? "");
        if (!projectId) return res.status(400).json({ error: "project_id required" });
        const direction = body.direction === "out" ? "out" : "in";
        const text = String(body.text ?? body.content ?? "").trim() || "[Сообщение]";
        const externalId = typeof body.external_id === "string" ? body.external_id : null;
        const rawFrom = typeof body.from === "string" ? body.from : typeof body.jid === "string" ? body.jid : "";
        const phoneDigits = normalizeWaPhone(
          typeof body.phone === "string" ? body.phone : rawFrom,
        );
        const lid =
          typeof body.whatsapp_lid === "string"
            ? body.whatsapp_lid
            : extractLid(rawFrom);
        const name = typeof body.name === "string" ? body.name : null;

        let mediaUrl: string | null =
          typeof body.media_url === "string" && body.media_url.trim() ? body.media_url.trim() : null;
        let mediaKind: string | null =
          typeof body.media_kind === "string" ? body.media_kind : null;
        let mediaMime: string | null =
          typeof body.media_mime === "string" ? body.media_mime : null;
        let mediaFilename: string | null =
          typeof body.media_filename === "string" ? body.media_filename : null;
        if (!mediaUrl && (body.media_base64 || body.media)) {
          const mediaObj = (body.media && typeof body.media === "object" ? body.media : {}) as Body;
          const media = await uploadMedia(adminDb(), projectId, {
            base64: String(body.media_base64 ?? mediaObj.base64 ?? ""),
            mime: String(body.media_mime ?? mediaObj.mime ?? "application/octet-stream"),
            filename: String(body.media_filename ?? mediaObj.filename ?? "file"),
            kind: String(body.media_kind ?? mediaObj.kind ?? "document"),
          });
          if (media) {
            mediaUrl = media.url;
            mediaKind = media.kind;
            mediaMime = media.mime;
            mediaFilename = media.filename;
          }
        }

        const out = await workerRpc("ingest", {
          project_id: projectId,
          direction,
          text,
          external_id: externalId,
          phone: phoneDigits,
          whatsapp_lid: lid,
          name,
          media_url: mediaUrl,
          media_kind: mediaKind,
          media_mime: mediaMime,
          media_filename: mediaFilename,
        });
        return res.status(200).json({ ...out, media_url: mediaUrl });
      }

      const passthrough = ["heartbeat", "list_sessions", "push_qr", "set_state", "claim", "ack"];
      if (passthrough.includes(action)) {
        const payload: Body = { ...body };
        if (action === "set_state" && typeof payload.phone === "string") {
          const pn = normalizeWaPhone(payload.phone) ?? digits(payload.phone);
          payload.phone = pn ? `+${pn}` : payload.phone;
        }
        const out = await workerRpc(action, payload);
        return res.status(200).json(out);
      }

      return res.status(400).json({ error: `unknown worker action: ${action}` });
    }

    // ── User actions (JWT + RLS) ────────────────────────────────
    const auth = await userClient(req);
    if ("error" in auth) return res.status(auth.status).json({ error: auth.error });

    const projectId = String(body.project_id ?? "").trim();
    if (!projectId) return res.status(400).json({ error: "project_id required" });

    const allowed = await canAccessProject(auth.db, auth.userId, projectId);
    if (!allowed) return res.status(403).json({ error: "forbidden" });

    const db = auth.db;

    if (action === "status") {
      const session = await ensureSession(db, projectId);
      return res.status(200).json({
        ok: true,
        session,
        worker_online: workerOnline(session.worker_heartbeat_at),
      });
    }

    if (action === "start_pair") {
      await ensureSession(db, projectId);
      await db
        .from("whatsapp_web_sessions")
        .update({
          status: "pairing",
          qr_data: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("project_id", projectId);
      await db.from("whatsapp_web_commands").insert({
        project_id: projectId,
        action: "pair",
        payload: {},
        status: "pending",
        created_by: auth.userId,
      });
      const session = await ensureSession(db, projectId);
      return res.status(200).json({
        ok: true,
        session,
        worker_online: workerOnline(session.worker_heartbeat_at),
      });
    }

    if (action === "logout") {
      await db.from("whatsapp_web_commands").insert({
        project_id: projectId,
        action: "logout",
        payload: {},
        status: "pending",
        created_by: auth.userId,
      });
      await db
        .from("whatsapp_web_sessions")
        .update({
          status: "disconnected",
          qr_data: null,
          qr_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("project_id", projectId);
      return res.status(200).json({ ok: true });
    }

    if (action === "send") {
      const phone = normalizeWaPhone(String(body.phone ?? ""));
      const text = String(body.text ?? body.message ?? "").trim();
      const leadId = typeof body.lead_id === "string" ? body.lead_id : null;
      if (!text) return res.status(400).json({ error: "text required" });
      if (!phone && !leadId) return res.status(400).json({ error: "phone or lead_id required" });

      const session = await ensureSession(db, projectId);
      if (session.status !== "connected") {
        return res.status(409).json({ error: "WhatsApp Web не подключён. Отсканируйте QR в Настройках." });
      }

      let toPhone = phone;
      if (!toPhone && leadId) {
        const { data: lead } = await db.from("leads").select("phone").eq("id", leadId).maybeSingle();
        toPhone = normalizeWaPhone(lead?.phone ?? null);
      }
      if (!toPhone) return res.status(400).json({ error: "не удалось определить телефон" });

      const { data: cmd, error } = await db
        .from("whatsapp_web_commands")
        .insert({
          project_id: projectId,
          action: "send",
          payload: { phone: toPhone, text, lead_id: leadId },
          status: "pending",
          created_by: auth.userId,
        })
        .select("id")
        .single();
      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({ ok: true, command_id: cmd?.id });
    }

    return res.status(400).json({ error: `unknown action: ${action}` });
  } catch (e) {
    console.error("wa-web-bridge", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
