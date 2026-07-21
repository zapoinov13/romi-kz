// Shared helpers for Meta WhatsApp Cloud API / Coexistence edge functions.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export const WA_GRAPH = "https://graph.facebook.com/v21.0";

export const WA_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function waJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...WA_CORS, "Content-Type": "application/json" },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function digits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** Personal WhatsApp user id / phone from Cloud API wa_id or chat id. */
export function normalizeWaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.includes("@g.us") || s.includes("@broadcast") || s.includes("@lid")) return null;
  const base = s.split("@")[0] ?? s;
  const d = digits(base);
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

export async function firstStageNew(
  admin: SupabaseClient,
  pipelineId: string,
): Promise<string | null> {
  const { data: byKey } = await admin
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .eq("key", "new")
    .maybeSingle();
  if (byKey?.id) return byKey.id;

  const { data } = await admin
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function getDefaultStage(
  admin: SupabaseClient,
  projectId: string | null,
): Promise<{ pipeline_id: string; stage_id: string } | null> {
  const tryPipe = async (id: string | null | undefined) => {
    if (!id) return null;
    const sid = await firstStageNew(admin, id);
    return sid ? { pipeline_id: id, stage_id: sid } : null;
  };

  if (projectId) {
    const { data: d1 } = await admin
      .from("pipelines")
      .select("id")
      .eq("project_id", projectId)
      .eq("is_default", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const r1 = await tryPipe(d1?.id);
    if (r1) return r1;

    const { data: d2 } = await admin
      .from("pipelines")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const r2 = await tryPipe(d2?.id);
    if (r2) return r2;
  }

  return null;
}

export async function findLeadIdByPhone(
  admin: SupabaseClient,
  phoneDigits: string,
  projectId: string | null,
): Promise<string | null> {
  const phone = `+${phoneDigits}`;
  let q = admin
    .from("leads")
    .select("id, phone")
    .or(`phone.eq.${phone},phone.eq.+${phoneDigits},phone.eq.${phoneDigits}`)
    .limit(1);
  if (projectId) q = q.eq("project_id", projectId);
  const { data: existing } = await q;
  if (existing && existing.length > 0) return (existing[0] as { id: string }).id;

  let scan = admin
    .from("leads")
    .select("id, phone")
    .order("created_at", { ascending: false })
    .limit(500);
  if (projectId) scan = scan.eq("project_id", projectId);
  const { data: recent } = await scan;
  const match = (recent ?? []).find((l) => digits(l.phone) === phoneDigits) as
    | { id: string }
    | undefined;
  return match?.id ?? null;
}

export async function findOrCreateLead(opts: {
  admin: SupabaseClient;
  phoneDigits: string;
  name?: string | null;
  projectId: string | null;
  cabinetId?: string | null;
  createIfMissing: boolean;
}): Promise<string | null> {
  const { admin, phoneDigits, projectId, cabinetId, createIfMissing } = opts;
  const existing = await findLeadIdByPhone(admin, phoneDigits, projectId);
  if (existing) return existing;
  if (!createIfMissing || !projectId) return null;

  let stage = await getDefaultStage(admin, projectId);
  if (!stage) {
    await admin.rpc("ensure_project_pipeline", { p_project_id: projectId }).catch(() => null);
    stage = await getDefaultStage(admin, projectId);
  }
  if (!stage) {
    console.error("wa: no pipeline/stage for project", projectId);
    return null;
  }

  let ownerId: string | null = null;
  const { data: proj } = await admin
    .from("projects")
    .select("created_by")
    .eq("id", projectId)
    .maybeSingle();
  ownerId = (proj as { created_by?: string | null } | null)?.created_by ?? null;

  const displayName = (opts.name ?? "").trim() || `+${phoneDigits}`;
  const { data: created, error } = await admin
    .from("leads")
    .insert({
      name: displayName,
      phone: `+${phoneDigits}`,
      source: "whatsapp",
      channel: "whatsapp",
      project_id: projectId,
      cabinet_id: cabinetId ?? null,
      pipeline_id: stage.pipeline_id,
      stage_id: stage.stage_id,
      created_by: ownerId,
      assigned_to: ownerId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("wa: lead insert failed", error.message);
    // race: try find again
    return await findLeadIdByPhone(admin, phoneDigits, projectId);
  }
  return created?.id ?? null;
}

export async function insertCommunication(opts: {
  admin: SupabaseClient;
  leadId: string;
  direction: "in" | "out";
  text: string;
  externalId?: string | null;
  isAuto?: boolean;
}) {
  if (opts.externalId) {
    const { data: existing } = await opts.admin
      .from("communications")
      .select("id")
      .eq("external_id", opts.externalId)
      .maybeSingle();
    if (existing?.id) return;
  }
  await opts.admin.from("communications").insert({
    lead_id: opts.leadId,
    type: "message",
    direction: opts.direction,
    channel: "whatsapp",
    content: opts.text || "[Сообщение]",
    status: opts.direction === "in" ? "delivered" : "sent",
    is_draft: false,
    is_auto: !!opts.isAuto,
    external_id: opts.externalId ?? null,
  });
}

export function extractCloudMessageText(message: Record<string, unknown>): string {
  const type = String(message.type ?? "");
  if (type === "text") {
    const t = (message.text as { body?: string } | undefined)?.body;
    return (t ?? "").trim() || "[Текст]";
  }
  if (type === "button") {
    const t = (message.button as { text?: string } | undefined)?.text;
    return (t ?? "").trim() || "[Кнопка]";
  }
  if (type === "interactive") {
    const interactive = message.interactive as Record<string, unknown> | undefined;
    const btn = interactive?.button_reply as { title?: string } | undefined;
    const list = interactive?.list_reply as { title?: string } | undefined;
    return (btn?.title ?? list?.title ?? "").trim() || "[Интерактив]";
  }
  if (type === "image") return "[Фото]";
  if (type === "video") return "[Видео]";
  if (type === "audio") return "[Аудио]";
  if (type === "document") return "[Документ]";
  if (type === "sticker") return "[Стикер]";
  if (type === "location") return "[Геолокация]";
  if (type === "contacts") return "[Контакт]";
  if (type === "reaction") return "[Реакция]";
  return type ? `[${type}]` : "[Сообщение]";
}

export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = Deno.env.get("META_APP_WEBHOOK_SECRET")?.trim()
    || Deno.env.get("META_APP_SECRET")?.trim()
    || "";
  if (!secret) {
    // Fail open only in local/dev if explicitly allowed
    if (Deno.env.get("WA_WEBHOOK_SKIP_SIGNATURE") === "1") return true;
    console.warn("wa-cloud-webhook: META_APP_WEBHOOK_SECRET not set");
    return false;
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice("sha256=".length).trim().toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const actualHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (actualHex.length !== expectedHex.length) return false;
  let ok = 0;
  for (let i = 0; i < actualHex.length; i++) {
    ok |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return ok === 0;
}
