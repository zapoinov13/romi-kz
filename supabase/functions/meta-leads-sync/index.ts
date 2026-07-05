// Автосбор лидов из Meta Lead Ads (instant forms) → CRM + аналитика продаж.
// Запуск: pg_cron каждые 10 мин (x-automation-key) или вручную админом.
//
// Требует у кабинета: page_id (+ опционально lead_form_id).
// Права Meta token: leads_retrieval, pages_manage_ads, pages_read_engagement, pages_show_list.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import {
  CABINET_META_SELECT,
  enrichCabinetMeta,
  resolvePageId,
  type CabinetMetaRow,
} from "../_lib/cabinet_meta_resolve.ts";
import { resolveMetaTokens } from "../_lib/meta_tokens.ts";
import { requireUser, userHasRole } from "../_lib/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-automation-key, x-cron-key",
};

const GRAPH = "https://graph.facebook.com/v21.0";
const LOOKBACK_DAYS = 14;
const OVERLAP_MINUTES = 30;

type MetaField = { name?: string; values?: string[] };
type MetaLeadRow = {
  id: string;
  created_time?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  form_id?: string;
  field_data?: MetaField[];
  platform?: string;
  is_organic?: boolean | string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

async function isCronAuthorized(
  req: Request,
  admin: ReturnType<typeof createClient>,
): Promise<boolean> {
  const envCronKey = Deno.env.get("META_SYNC_CRON_KEY");
  const envCronHeader = req.headers.get("x-cron-key");
  if (envCronKey && envCronHeader === envCronKey) return true;

  const automationKey = req.headers.get("x-automation-key");
  if (automationKey) {
    const { data: settings } = await admin
      .from("automation_settings")
      .select("cron_secret")
      .eq("id", true)
      .maybeSingle();
    const dbSecret = (settings as { cron_secret?: string | null } | null)?.cron_secret ?? null;
    if (dbSecret && automationKey === dbSecret) return true;
  }
  return false;
}

async function fetchGraph<T>(
  path: string,
  token: string,
  maxPages = 10,
): Promise<{ ok: true; data: T[] } | { ok: false; error: string }> {
  const out: T[] = [];
  let url: string | null = `${GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}&limit=100`;
  let pages = 0;
  while (url && pages < maxPages) {
    pages += 1;
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (body as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    out.push(...(((body as { data?: T[] }).data ?? []) as T[]));
    url = ((body as { paging?: { next?: string } }).paging?.next as string | undefined) ?? null;
  }
  return { ok: true, data: out };
}

async function getPageToken(pageId: string, userToken: string): Promise<string | null> {
  const res = await fetch(
    `${GRAPH}/${pageId}?fields=access_token&access_token=${encodeURIComponent(userToken)}`,
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const t = (body as { access_token?: string }).access_token;
  return t?.trim() || null;
}

async function listFormIds(
  pageId: string,
  token: string,
  configuredFormId: string | null,
): Promise<{ ok: true; formIds: string[] } | { ok: false; error: string }> {
  if (configuredFormId?.trim()) {
    return { ok: true, formIds: [configuredFormId.trim()] };
  }
  const r = await fetchGraph<{ id: string }>(
    `/${pageId}/leadgen_forms?fields=id,status&limit=200`,
    token,
    3,
  );
  if (!r.ok) return r;
  const active = r.data.filter((f) => f.id);
  return { ok: true, formIds: active.map((f) => String(f.id)) };
}

function parseLeadFields(fields: MetaField[] | undefined): {
  name: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
} {
  const map = new Map<string, string>();
  for (const f of fields ?? []) {
    const key = (f.name ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    const val = (f.values ?? []).map((v) => String(v).trim()).filter(Boolean).join(", ");
    if (key && val) map.set(key, val);
  }

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = map.get(k);
      if (v) return v;
    }
    for (const [k, v] of map) {
      if (keys.some((key) => k.includes(key))) return v;
    }
    return null;
  };

  const first = pick("first_name", "firstname", "имя");
  const last = pick("last_name", "lastname", "фамилия");
  const full = pick("full_name", "fullname", "name", "имя_фамилия", "фио");
  const name = full || [first, last].filter(Boolean).join(" ").trim() || null;

  const phone = pick(
    "phone_number",
    "phone",
    "tel",
    "mobile",
    "telephone",
    "телефон",
    "номер_телефона",
    "whatsapp",
  );
  const email = pick("email", "e-mail", "почта", "email_address");

  const used = new Set(["full_name", "fullname", "name", "first_name", "last_name", "phone_number", "phone", "email"]);
  const extra: string[] = [];
  for (const [k, v] of map) {
    if ([...used].some((u) => k.includes(u))) continue;
    extra.push(`${k}: ${v}`);
  }

  return { name, phone, email, note: extra.length ? extra.join("\n") : null };
}

async function enrichAdLabel(
  admin: ReturnType<typeof createClient>,
  metaAdId: string,
): Promise<string | null> {
  const { data: mc } = await admin
    .from("meta_creatives")
    .select("name, headline")
    .eq("ad_id", metaAdId)
    .maybeSingle();
  let label = (mc?.name ?? "").trim() || (mc?.headline ?? "").trim();
  if (label) return label;
  const { data: ac } = await admin
    .from("ad_campaigns")
    .select("ad_name, headline")
    .eq("meta_ad_id", metaAdId)
    .maybeSingle();
  label = (ac?.ad_name ?? "").trim() || (ac?.headline ?? "").trim();
  return label || null;
}

function buildUtm(metaLead: MetaLeadRow, adLabel: string | null, formName?: string | null) {
  const utm: Record<string, string> = {
    utm_source: "meta",
    utm_medium: "lead_form",
    utm_campaign: metaLead.campaign_id ?? formName ?? "",
    utm_content: metaLead.ad_id ?? "",
    utm_term: metaLead.adset_id ?? "",
    source: "meta",
    medium: "lead_form",
    campaign: metaLead.campaign_id ?? formName ?? "",
    content: metaLead.ad_id ?? "",
    term: metaLead.adset_id ?? "",
  };
  if (adLabel) {
    utm.ad_name = adLabel;
    utm.headline = adLabel;
  } else if (formName) {
    utm.ad_name = formName;
    utm.headline = formName;
  }
  return utm;
}

async function firstStage(admin: ReturnType<typeof createClient>, pipelineId: string) {
  const { data } = await admin
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function getDefaultStage(
  admin: ReturnType<typeof createClient>,
  projectId: string | null,
): Promise<{ pipeline_id: string; stage_id: string } | null> {
  const tryPipe = async (id: string | null | undefined) => {
    if (!id) return null;
    const stage_id = await firstStage(admin, id);
    return stage_id ? { pipeline_id: id, stage_id } : null;
  };

  if (projectId) {
    const { data: defaultProj } = await admin
      .from("pipelines")
      .select("id")
      .eq("project_id", projectId)
      .eq("is_default", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const r1 = await tryPipe(defaultProj?.id);
    if (r1) return r1;

    const { data: anyProj } = await admin
      .from("pipelines")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const r2 = await tryPipe(anyProj?.id);
    if (r2) return r2;
  }

  const { data: anyPipe } = await admin
    .from("pipelines")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return tryPipe(anyPipe?.id);
}

async function findExistingLeadId(
  admin: ReturnType<typeof createClient>,
  phone: string,
  projectId: string | null,
): Promise<string | null> {
  const d = digits(phone);
  if (!d) return null;
  let q = admin.from("leads").select("id, phone").or(`phone.eq.+${d},phone.eq.${d}`).limit(1);
  if (projectId) q = q.eq("project_id", projectId);
  const { data } = await q;
  if (data?.[0]?.id) return data[0].id as string;

  let scan = admin.from("leads").select("id, phone").order("created_at", { ascending: false }).limit(500);
  if (projectId) scan = scan.eq("project_id", projectId);
  const { data: recent } = await scan;
  return (recent ?? []).find((l) => digits(String(l.phone ?? "")) === d)?.id as string | undefined ?? null;
}

async function ingestMetaLead(
  admin: ReturnType<typeof createClient>,
  cab: CabinetMetaRow,
  metaLead: MetaLeadRow,
  formName: string | null,
): Promise<{ ok: true; leadId: string; created: boolean } | { ok: false; error: string }> {
  const parsed = parseLeadFields(metaLead.field_data);
  const phoneDigits = digits(parsed.phone ?? "");
  if (phoneDigits.length < 10) {
    return { ok: false, error: "no_phone" };
  }
  const phoneE164 = `+${phoneDigits}`;
  const name = parsed.name?.trim() || phoneE164;
  const projectId = cab.project_id ?? null;
  const metaAdId = metaLead.ad_id?.trim() || null;
  const adLabel = metaAdId ? await enrichAdLabel(admin, metaAdId) : null;
  const utm = buildUtm(metaLead, adLabel, formName);
  const metaCreatedAt = metaLead.created_time ? new Date(metaLead.created_time).toISOString() : new Date().toISOString();

  const existingId = await findExistingLeadId(admin, phoneE164, projectId);
  if (existingId) {
    await admin.from("leads").update({
      last_activity_at: new Date().toISOString(),
      utm,
      ...(metaAdId ? { meta_ad_id: metaAdId } : {}),
      ...(metaLead.adset_id ? { meta_adset_id: metaLead.adset_id } : {}),
      ...(metaLead.campaign_id ? { meta_campaign_id: metaLead.campaign_id } : {}),
      source: "lead_form",
    }).eq("id", existingId);
    return { ok: true, leadId: existingId, created: false };
  }

  const def = await getDefaultStage(admin, projectId);
  if (!def) return { ok: false, error: "no_pipeline" };

  let ownerId: string | null = null;
  if (projectId) {
    const { data: proj } = await admin.from("projects").select("created_by").eq("id", projectId).maybeSingle();
    ownerId = (proj as { created_by?: string | null } | null)?.created_by ?? null;
  }

  const { data: created, error } = await admin.from("leads").insert({
    name,
    phone: phoneE164,
    email: parsed.email,
    source: "lead_form",
    channel: "web",
    note: parsed.note,
    project_id: projectId,
    cabinet_id: cab.id,
    pipeline_id: def.pipeline_id,
    stage_id: def.stage_id,
    created_by: ownerId,
    assigned_to: ownerId,
    utm,
    meta_ad_id: metaAdId,
    meta_adset_id: metaLead.adset_id ?? null,
    meta_campaign_id: metaLead.campaign_id ?? null,
    first_touch_at: metaCreatedAt,
    created_at: metaCreatedAt,
  }).select("id").single();

  if (error || !created) {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }
  return { ok: true, leadId: created.id as string, created: true };
}

async function syncCabinet(
  admin: ReturnType<typeof createClient>,
  cabRow: CabinetMetaRow,
  metaTokens: string[],
  sinceIso: string,
): Promise<Record<string, unknown>> {
  const cab = await enrichCabinetMeta(admin, cabRow, metaTokens);
  if (!cab) return { cabinet_id: cabRow.id, skipped: "cabinet_not_found" };

  const pageId = resolvePageId(cab);
  if (!pageId) {
    return { cabinet_id: cab.id, cabinet: cab.name, skipped: "no_page_id" };
  }

  const userToken = cab.access_token?.trim() || metaTokens[0] || "";
  if (!userToken) {
    return { cabinet_id: cab.id, cabinet: cab.name, skipped: "no_meta_token" };
  }

  const pageToken = (await getPageToken(pageId, userToken)) ?? userToken;
  const formsRes = await listFormIds(pageId, pageToken, cab.lead_form_id);
  if (!formsRes.ok) {
    return { cabinet_id: cab.id, cabinet: cab.name, error: formsRes.error };
  }
  if (formsRes.formIds.length === 0) {
    return { cabinet_id: cab.id, cabinet: cab.name, skipped: "no_forms" };
  }

  const sinceUnix = Math.floor(new Date(sinceIso).getTime() / 1000);
  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  const errors: string[] = [];

  for (const formId of formsRes.formIds) {
    const leadsRes = await fetchGraph<MetaLeadRow>(
      `/${formId}/leads?fields=created_time,id,ad_id,adset_id,campaign_id,form_id,field_data,platform,is_organic&filtering=${encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }]))}`,
      pageToken,
      15,
    );
    if (!leadsRes.ok) {
      errors.push(`form ${formId}: ${leadsRes.error}`);
      continue;
    }

    for (const ml of leadsRes.data) {
      const metaLeadId = String(ml.id ?? "").trim();
      if (!metaLeadId) continue;

      const { data: seen } = await admin
        .from("meta_lead_ingest")
        .select("id")
        .eq("meta_lead_id", metaLeadId)
        .maybeSingle();
      if (seen) {
        duplicates += 1;
        continue;
      }

      const ingested = await ingestMetaLead(admin, cab, ml, null);
      if (!ingested.ok) {
        if (ingested.error !== "no_phone") errors.push(`${metaLeadId}: ${ingested.error}`);
        else skipped += 1;
        continue;
      }

      await admin.from("meta_lead_ingest").insert({
        meta_lead_id: metaLeadId,
        form_id: ml.form_id ?? formId,
        lead_id: ingested.leadId,
        cabinet_id: cab.id,
        project_id: cab.project_id,
        meta_ad_id: ml.ad_id ?? null,
        meta_created_at: ml.created_time ? new Date(ml.created_time).toISOString() : null,
      });

      imported += ingested.created ? 1 : 0;
      if (!ingested.created) duplicates += 1;
    }
  }

  await admin.from("meta_lead_sync_state").upsert({
    cabinet_id: cab.id,
    project_id: cab.project_id,
    last_sync_at: new Date().toISOString(),
    last_error: errors.length ? errors.slice(0, 3).join("; ") : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "cabinet_id" });

  return {
    cabinet_id: cab.id,
    cabinet: cab.name,
    forms: formsRes.formIds.length,
    imported,
    duplicates,
    skipped,
    errors: errors.slice(0, 5),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const cronOk = await isCronAuthorized(req, admin);
    if (!cronOk) {
      const auth = await requireUser(req);
      if (!auth.ok) return auth.response;
      if (!(await userHasRole(auth.userId, "admin"))) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    const url = new URL(req.url);
    const cabinetId = (body.cabinet_id as string | undefined) ?? url.searchParams.get("cabinet_id") ?? null;
    const lookbackDays = Number(body.lookback_days ?? url.searchParams.get("lookback_days") ?? LOOKBACK_DAYS);

    let cabQuery = admin.from("ad_cabinets").select(CABINET_META_SELECT);
    if (cabinetId) cabQuery = cabQuery.eq("id", cabinetId);
    else cabQuery = cabQuery.not("page_id", "is", null);

    const { data: cabinets, error: cabErr } = await cabQuery;
    if (cabErr) throw cabErr;

    const metaTokens = await resolveMetaTokens(null);
    if (metaTokens.length === 0) {
      return json({ error: "Meta access token не настроен" }, 500);
    }

    const defaultSince = new Date(Date.now() - lookbackDays * 24 * 3600 * 1000).toISOString();
    const results: Record<string, unknown>[] = [];

    for (const cab of (cabinets ?? []) as CabinetMetaRow[]) {
      const { data: state } = await admin
        .from("meta_lead_sync_state")
        .select("last_sync_at")
        .eq("cabinet_id", cab.id)
        .maybeSingle();
      const lastSync = (state as { last_sync_at?: string | null } | null)?.last_sync_at;
      const sinceIso = lastSync
        ? new Date(new Date(lastSync).getTime() - OVERLAP_MINUTES * 60 * 1000).toISOString()
        : defaultSince;

      results.push(await syncCabinet(admin, cab, metaTokens, sinceIso));
    }

    const totalImported = results.reduce((s, r) => s + Number(r.imported ?? 0), 0);
    return json({ ok: true, imported: totalImported, cabinets: results.length, results });
  } catch (e) {
    console.error("meta-leads-sync error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
