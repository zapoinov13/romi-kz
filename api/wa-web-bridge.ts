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

function admin(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function workerKeyOk(req: VercelRequest): boolean {
  const expected = process.env.WA_WEB_WORKER_KEY?.trim();
  if (!expected) return false;
  const got = String(req.headers["x-wa-web-key"] ?? "").trim();
  return !!got && got === expected;
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
    await opts.db.rpc("ensure_project_pipeline", { p_project_id: opts.projectId }).catch(() => null);
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
  return { db: admin(), userId: userData.user.id, authHeader };
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
    // ── Worker actions ──────────────────────────────────────────
    if (workerKeyOk(req)) {
      const db = admin();

      if (action === "heartbeat") {
        const projectId = typeof body.project_id === "string" ? body.project_id : null;
        const now = new Date().toISOString();
        if (projectId) {
          await ensureSession(db, projectId);
          await db
            .from("whatsapp_web_sessions")
            .update({ worker_heartbeat_at: now, updated_at: now })
            .eq("project_id", projectId);
        } else {
          await db
            .from("whatsapp_web_sessions")
            .update({ worker_heartbeat_at: now, updated_at: now })
            .in("status", ["connected", "pairing"]);
        }
        return res.status(200).json({ ok: true, at: now });
      }

      if (action === "list_sessions") {
        const { data } = await db
          .from("whatsapp_web_sessions")
          .select("id, project_id, status, phone, display_name, qr_expires_at, worker_heartbeat_at")
          .in("status", ["connected", "pairing"]);
        return res.status(200).json({ ok: true, sessions: data ?? [] });
      }

      if (action === "push_qr") {
        const projectId = String(body.project_id ?? "");
        const qrData = String(body.qr_data ?? "");
        if (!projectId || !qrData) return res.status(400).json({ error: "project_id, qr_data required" });
        await ensureSession(db, projectId);
        const expires = new Date(Date.now() + 60_000).toISOString();
        await db
          .from("whatsapp_web_sessions")
          .update({
            status: "pairing",
            qr_data: qrData,
            qr_expires_at: expires,
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("project_id", projectId);
        return res.status(200).json({ ok: true, qr_expires_at: expires });
      }

      if (action === "set_state") {
        const projectId = String(body.project_id ?? "");
        const status = String(body.status ?? "");
        if (!projectId || !["disconnected", "pairing", "connected", "error"].includes(status)) {
          return res.status(400).json({ error: "project_id + valid status required" });
        }
        await ensureSession(db, projectId);
        const patch: Record<string, unknown> = {
          status,
          updated_at: new Date().toISOString(),
          last_error: typeof body.last_error === "string" ? body.last_error : null,
        };
        if (typeof body.phone === "string") {
          const pn = normalizeWaPhone(body.phone) ?? digits(body.phone);
          patch.phone = pn ? `+${pn}` : body.phone;
        }
        if (typeof body.display_name === "string") patch.display_name = body.display_name;
        if (status === "connected") {
          patch.paired_at = new Date().toISOString();
          patch.qr_data = null;
          patch.qr_expires_at = null;
        }
        if (status === "disconnected") {
          patch.qr_data = null;
          patch.qr_expires_at = null;
        }
        await db.from("whatsapp_web_sessions").update(patch).eq("project_id", projectId);
        return res.status(200).json({ ok: true });
      }

      if (action === "claim") {
        const limit = Math.min(Number(body.limit) || 20, 50);
        const { data: pending } = await db
          .from("whatsapp_web_commands")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(limit);
        return res.status(200).json({ ok: true, commands: pending ?? [] });
      }

      if (action === "ack") {
        const id = String(body.command_id ?? body.id ?? "");
        const status = String(body.status ?? "");
        if (!id || !["done", "failed"].includes(status)) {
          return res.status(400).json({ error: "command_id + status done|failed required" });
        }
        await db
          .from("whatsapp_web_commands")
          .update({
            status,
            result: body.result ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        return res.status(200).json({ ok: true });
      }

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

        if (!phoneDigits && !lid) {
          return res.status(400).json({ error: "need phone or whatsapp_lid", skipped: true });
        }

        // Don't create lead from LID-only without phone
        const leadId = await findOrCreateLead({
          db,
          projectId,
          phoneDigits,
          lid,
          name,
          createIfMissing: direction === "in" && !!phoneDigits,
        });
        if (!leadId) {
          return res.status(200).json({
            ok: true,
            skipped: true,
            reason: phoneDigits ? "lead_create_failed" : "lid_only_no_lead",
          });
        }

        if (externalId) {
          const { data: exists } = await db
            .from("communications")
            .select("id")
            .eq("external_id", externalId)
            .maybeSingle();
          if (exists?.id) return res.status(200).json({ ok: true, deduped: true, lead_id: leadId });
        }

        let media: { url: string; kind: string; mime: string; filename: string } | null = null;
        if (body.media_base64 || body.media) {
          const mediaObj = (body.media && typeof body.media === "object" ? body.media : {}) as Body;
          media = await uploadMedia(db, projectId, {
            base64: String(body.media_base64 ?? mediaObj.base64 ?? ""),
            mime: String(body.media_mime ?? mediaObj.mime ?? "application/octet-stream"),
            filename: String(body.media_filename ?? mediaObj.filename ?? "file"),
            kind: String(body.media_kind ?? mediaObj.kind ?? "document"),
          });
        }

        await db.from("communications").insert({
          lead_id: leadId,
          type: "message",
          direction,
          channel: "whatsapp",
          content: text,
          status: direction === "in" ? "delivered" : "sent",
          is_draft: false,
          is_auto: false,
          external_id: externalId,
          media_url: media?.url ?? null,
          media_kind: media?.kind ?? null,
          media_mime: media?.mime ?? null,
          media_filename: media?.filename ?? null,
        });

        const now = new Date().toISOString();
        const actPatch: Record<string, unknown> = { last_activity_at: now };
        if (direction === "in") actPatch.last_inbound_at = now;
        else actPatch.last_outbound_at = now;
        await db.from("leads").update(actPatch).eq("id", leadId);

        return res.status(200).json({ ok: true, lead_id: leadId });
      }

      return res.status(400).json({ error: `unknown worker action: ${action}` });
    }

    // ── User actions (JWT) ──────────────────────────────────────
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
