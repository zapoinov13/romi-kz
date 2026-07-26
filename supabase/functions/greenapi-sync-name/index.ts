// Sync WhatsApp profile name via Green API getContactInfo (separate from greenapi-proxy for Lovable deploy stability).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ENV_ID = Deno.env.get("GREENAPI_ID_INSTANCE") ?? "";
const ENV_TOKEN = Deno.env.get("GREENAPI_API_TOKEN") ?? "";
const ENV_URL = Deno.env.get("GREENAPI_API_URL") ?? "https://api.green-api.com";

const ALLOWED_EXACT_HOSTS = new Set(["api.green-api.com", "api.greenapi.com"]);
const ALLOWED_HOST_SUFFIX = ".api.greenapi.com";
const ALLOWED_SUBDOMAIN_PATTERN = /^[a-z0-9-]+\.api\.greenapi\.com$/i;

function isAllowedGreenApiHost(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();
  if (!h || h === "localhost" || h === "169.254.169.254") return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return false;
  if (ALLOWED_EXACT_HOSTS.has(h)) return true;
  return h.endsWith(ALLOWED_HOST_SUFFIX) && ALLOWED_SUBDOMAIN_PATTERN.test(h);
}

function validateGreenApiBaseUrl(raw: string | null | undefined): string {
  if (!raw?.trim()) return ENV_URL || "https://api.green-api.com";
  const u = new URL(raw.trim());
  if (u.protocol !== "https:") throw new Error("apiUrl must use https");
  if (u.pathname !== "/" && u.pathname !== "") throw new Error("apiUrl must not include a path");
  if (!isAllowedGreenApiHost(u.hostname.toLowerCase())) throw new Error("apiUrl host not allowed");
  return u.origin.replace(/\/+$/, "");
}

type Creds = {
  idInstance: string;
  apiToken: string;
  baseUrl: string;
};

const PHONEBOOK_LABELS = new Set([
  "муж", "жена", "wife", "husband", "мама", "папа", "mom", "dad",
  "брат", "сестра", "bro", "sis", "brother", "sister", "друг", "подруга",
  "клиент", "client", "customer", "заказчик", "пациент", "patient",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isPhonebookLabel(name: string): boolean {
  return PHONEBOOK_LABELS.has(name.trim().toLowerCase());
}

function pickWaDisplayName(info: { name?: string; contactName?: string }): string {
  const profile = (info.name ?? "").trim();
  if (profile && !isPhonebookLabel(profile)) return profile;
  return "";
}

function isServiceRoleRequest(req: Request): boolean {
  if (!SERVICE_ROLE) return false;
  const auth = (req.headers.get("Authorization") ?? "").trim();
  return auth === `Bearer ${SERVICE_ROLE}`;
}

async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth || !ANON_KEY) return null;
  try {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await userClient.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function lookupWaCreds(
  projectId: string | null,
  cabinetId: string | null,
): Promise<Creds | { error: string; status: number; skipped?: boolean }> {
  type WaRow = {
    id_instance: string | null;
    api_token: string | null;
    api_url: string | null;
  };
  let row: WaRow | null = null;
  const sb = admin();

  if (cabinetId) {
    const { data } = await sb.from("whatsapp_config").select("id_instance, api_token, api_url").eq("cabinet_id", cabinetId).maybeSingle();
    row = data as WaRow | null;
  }
  if (!row?.id_instance && projectId) {
    const { data } = await sb.from("whatsapp_config").select("id_instance, api_token, api_url").eq("project_id", projectId).is("cabinet_id", null).maybeSingle();
    row = data as WaRow | null;
  }
  if (!row?.id_instance && projectId) {
    const { data } = await sb.from("whatsapp_config").select("id_instance, api_token, api_url").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    row = data as WaRow | null;
  }
  if (!row?.id_instance && ENV_ID && ENV_TOKEN) {
    return { idInstance: ENV_ID, apiToken: ENV_TOKEN, baseUrl: validateGreenApiBaseUrl(ENV_URL) };
  }
  if (!row?.id_instance) return { error: "Green API not configured", status: 200, skipped: true };

  const apiToken = (row.api_token ?? "").trim() || (row.id_instance === ENV_ID ? ENV_TOKEN : "");
  if (!apiToken) return { error: "Green API token missing", status: 200, skipped: true };
  return {
    idInstance: row.id_instance!,
    apiToken,
    baseUrl: validateGreenApiBaseUrl(row.api_url),
  };
}

async function resolveCreds(
  req: Request,
  projectId: string | null,
  cabinetId: string | null,
): Promise<Creds | { error: string; status: number; skipped?: boolean }> {
  if (isServiceRoleRequest(req)) return lookupWaCreds(projectId, cabinetId);

  const userId = await getUserId(req);
  if (!userId) return { error: "Unauthorized", status: 401 };

  let pid = projectId;
  if (!pid) {
    const { data } = await admin().from("user_active_project").select("project_id").eq("user_id", userId).maybeSingle();
    pid = data?.project_id ?? null;
  }
  if (!pid) return { error: "project_id required", status: 400 };

  const { data: proj } = await admin().from("projects").select("id, created_by").eq("id", pid).maybeSingle();
  const { data: isAdmin } = await admin().rpc("has_role" as never, { _user_id: userId, _role: "admin" });
  if (!proj || (proj.created_by !== userId && isAdmin !== true)) {
    return { error: "Forbidden", status: 403 };
  }
  return lookupWaCreds(pid, cabinetId);
}

async function getContactInfo(creds: Creds, chatId: string) {
  const url = `${creds.baseUrl}/waInstance${creds.idInstance}/getContactInfo/${creds.apiToken}?chatId=${encodeURIComponent(chatId)}`;
  const res = await fetch(url);
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) as { name?: string; contactName?: string } };
  } catch {
    return { ok: res.ok, status: res.status, data: {} as { name?: string; contactName?: string } };
  }
}

async function syncLeadName(creds: Creds, leadId: string) {
  const sb = admin();
  const { data: lead, error } = await sb.from("leads").select("id, phone, name, channel, source").eq("id", leadId).maybeSingle();
  if (error || !lead) return { ok: true, skipped: true, reason: "Lead not found" };

  const row = lead as { phone?: string | null; name?: string | null; channel?: string | null; source?: string | null };
  const phoneRaw = String(row.phone ?? "").trim();
  // WhatsApp Web LID placeholders are not Green API chatIds — never call getContactInfo.
  if (/^lid:/i.test(phoneRaw) || /@lid\b/i.test(phoneRaw)) {
    return { ok: true, skipped: true, reason: "lid_placeholder" };
  }

  const isWa = row.channel === "whatsapp" || row.source === "whatsapp" || !!phoneRaw.replace(/\D/g, "");
  if (!isWa) return { ok: true, skipped: true };

  const digits = phoneRaw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return { ok: true, skipped: true, reason: "Invalid phone" };
  }

  const r = await getContactInfo(creds, `${digits}@c.us`);
  // Soft-fail: Green API 400/404 is normal for unknown contacts — never 4xx the edge response
  // (Lovable treats edge 400 as a blank-screen runtime error).
  if (!r.ok) return { ok: true, skipped: true, reason: `getContactInfo HTTP ${r.status}` };

  const next = pickWaDisplayName(r.data);
  const contactName = (r.data.contactName ?? "").trim();
  const current = (row.name ?? "").trim();
  const isPhone = /^\+?\d[\d\s()-]{7,}$/.test(current);
  const fromContactBook = !!contactName && current === contactName;
  const isLabel = isPhonebookLabel(current);

  if (next && current !== next && (!current || isPhone || fromContactBook || isLabel)) {
    await sb.from("leads").update({ name: next }).eq("id", leadId);
    return { ok: true, updated: true, name: next };
  }
  if (!next && (isLabel || fromContactBook)) {
    const fallback = (row.phone ?? "").trim();
    if (fallback && current !== fallback) {
      await sb.from("leads").update({ name: fallback }).eq("id", leadId);
      return { ok: true, updated: true, name: fallback };
    }
  }
  return { ok: true, updated: false, name: current || next || undefined };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Server misconfigured" }, 500);

  try {
    const body = req.method === "POST"
      ? ((await req.json().catch(() => ({}))) as Record<string, unknown>)
      : {};
    const projectId = typeof body.project_id === "string" ? body.project_id : null;
    const cabinetId = typeof body.cabinet_id === "string" ? body.cabinet_id : null;
    const credsOrErr = await resolveCreds(req, projectId, cabinetId);
    if ("error" in credsOrErr) {
      if (credsOrErr.skipped) {
        return json({ ok: true, skipped: true, reason: credsOrErr.error }, 200);
      }
      return json({ ok: false, error: credsOrErr.error }, credsOrErr.status);
    }
    const creds = credsOrErr;

    if (body.batch === true) {
      if (!projectId) return json({ ok: false, error: "project_id required" }, 400);
      const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
      const { data: leadRows } = await admin()
        .from("leads")
        .select("id, name, phone, channel, source")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .limit(limit);
      let updated = 0;
      let scanned = 0;
      for (const row of (leadRows ?? []) as { id: string; name?: string | null; phone?: string | null; channel?: string | null; source?: string | null }[]) {
        const isWa = row.channel === "whatsapp" || row.source === "whatsapp";
        if (!isWa) continue;
        const phoneRaw = String(row.phone ?? "").trim();
        if (/^lid:/i.test(phoneRaw) || /@lid\b/i.test(phoneRaw)) continue;
        const current = (row.name ?? "").trim();
        const isPhone = /^\+?\d[\d\s()-]{7,}$/.test(current);
        if (!isPhonebookLabel(current) && !isPhone && current) continue;
        scanned++;
        const r = await syncLeadName(creds, row.id);
        if (r.updated) updated++;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      return json({ ok: true, updated, scanned, limit });
    }

    const leadId = String(body.lead_id ?? body.leadId ?? "").trim();
    if (!leadId) return json({ ok: false, error: "lead_id required" }, 400);
    const result = await syncLeadName(creds, leadId);
    // Always 200 for sync outcomes — soft skips must not surface as Lovable runtime errors.
    return json(result, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
