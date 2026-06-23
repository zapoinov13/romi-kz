// Переключает статус одной Meta-кампании (ACTIVE / PAUSED).
// POST { campaign_id: string (meta numeric id), status: "ACTIVE" | "PAUSED" }
// Использует токен из automation_settings.meta_access_token.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const GRAPH = "https://graph.facebook.com/v21.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

  let body: { campaign_id?: string; status?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const campaignId = (body.campaign_id ?? "").trim();
  const status = (body.status ?? "").toUpperCase();
  if (!campaignId || !/^\d+$/.test(campaignId)) return json({ error: "campaign_id (Meta numeric id) required" }, 400);
  if (!["ACTIVE", "PAUSED"].includes(status)) return json({ error: "status must be ACTIVE or PAUSED" }, 400);

  // Проверим доступ: кампания привязана к кабинету, к которому есть доступ через RLS
  const { data: camp, error: campErr } = await userClient
    .from("meta_campaigns")
    .select("id, cabinet_id, campaign_id")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (campErr || !camp) return json({ error: "Кампания не найдена или нет доступа" }, 403);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: settings } = await admin
    .from("automation_settings")
    .select("meta_access_token")
    .eq("id", true)
    .maybeSingle();
  const token = (settings?.meta_access_token as string | undefined) ?? Deno.env.get("META_ACCESS_TOKEN") ?? "";
  if (!token) return json({ error: "Meta-токен не настроен (Настройки → Автоматизация)" }, 400);

  // POST в Meta Graph
  try {
    const params = new URLSearchParams();
    params.set("status", status);
    params.set("access_token", token);
    const r = await fetch(`${GRAPH}/${campaignId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const text = await r.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch { /* keep text */ }
    if (!r.ok) {
      const msg = parsed?.error?.error_user_msg ?? parsed?.error?.message ?? text;
      return json({ error: `Meta: ${msg}` }, 502);
    }

    await admin
      .from("meta_campaigns")
      .update({ status, effective_status: status, last_synced_at: new Date().toISOString() })
      .eq("campaign_id", campaignId);

    return json({ ok: true, status });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});