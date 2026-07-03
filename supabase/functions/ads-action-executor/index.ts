// Executes a pending ad_auto_actions row against Meta Graph API.
// POST { action_id: string } — auth required, called from UI/Telegram or kpi-evaluator (with service role).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GRAPH = "https://graph.facebook.com/v21.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function metaToken(admin: any): Promise<string> {
  const { data: settings } = await admin
    .from("automation_settings")
    .select("meta_access_token")
    .eq("id", true)
    .maybeSingle();
  return (settings?.meta_access_token as string | undefined) ?? Deno.env.get("META_ACCESS_TOKEN") ?? "";
}

async function fetchCampaignSnapshot(token: string, campaignId: string) {
  const url = `${GRAPH}/${campaignId}?fields=status,effective_status,daily_budget,lifetime_budget&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  const text = await r.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  if (!r.ok) throw new Error(parsed?.error?.error_user_msg ?? parsed?.error?.message ?? text);
  return parsed;
}

async function postEntity(token: string, entityId: string, params: Record<string, string>) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${GRAPH}/${entityId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await r.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* keep */ }
  if (!r.ok) throw new Error(parsed?.error?.error_user_msg ?? parsed?.error?.message ?? text);
  return parsed;
}

async function fetchEntitySnapshot(token: string, entityId: string) {
  const url = `${GRAPH}/${entityId}?fields=status,effective_status,daily_budget,lifetime_budget&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  const text = await r.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  if (!r.ok) throw new Error(parsed?.error?.error_user_msg ?? parsed?.error?.message ?? text);
  return parsed;
}

async function duplicateAdset(token: string, adsetId: string, statusOption: string) {
  const body = new URLSearchParams({
    access_token: token,
    status_option: statusOption,
    rename_suffix: " · auto",
  });
  const r = await fetch(`${GRAPH}/${adsetId}/copies`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await r.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* keep */ }
  if (!r.ok) throw new Error(parsed?.error?.error_user_msg ?? parsed?.error?.message ?? text);
  const copied = (parsed?.copied_adset_id ?? parsed?.id ?? null) as string | null;
  return copied;
}

async function postCampaign(token: string, campaignId: string, params: Record<string, string>) {
  return postEntity(token, campaignId, params);
}

async function notifyTelegram(admin: any, projectId: string, text: string) {
  try {
    const { data: bot } = await admin
      .from("project_ads_telegram_bots")
      .select("bot_token,chat_id,is_active")
      .eq("project_id", projectId)
      .maybeSingle();
    if (!bot?.is_active || !bot.bot_token || !bot.chat_id) return;
    await fetch(`https://api.telegram.org/bot${bot.bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: bot.chat_id, text, parse_mode: "HTML" }),
    });
  } catch { /* swallow */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: either a user JWT (RLS check) or service role caller (internal).
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceCall = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  let userId: string | null = null;
  if (!isServiceCall) {
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: userData, error } = await userClient.auth.getUser();
    if (error || !userData.user) return json({ error: "Unauthorized" }, 401);
    userId = userData.user.id;
  }

  let body: { action_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const actionId = (body.action_id ?? "").trim();
  if (!actionId) return json({ error: "action_id required" }, 400);

  const { data: action, error: aErr } = await admin
    .from("ad_auto_actions")
    .select("*")
    .eq("id", actionId)
    .maybeSingle();
  if (aErr || !action) return json({ error: "Action not found" }, 404);
  if (action.status !== "pending") return json({ error: `Action is ${action.status}` }, 409);

  // RLS check for user calls
  if (!isServiceCall && userId) {
    const { data: access } = await admin.rpc("user_can_access_project", { _project_id: action.project_id });
    if (!access) return json({ error: "Forbidden" }, 403);
  }

  const token = await metaToken(admin);
  if (!token) {
    await admin.from("ad_auto_actions").update({
      status: "failed", error: "Meta token not configured", applied_at: new Date().toISOString(),
    }).eq("id", actionId);
    return json({ error: "Meta token not configured" }, 400);
  }

  try {
    let beforeSnap: Record<string, unknown> = {};
    let afterSnap: Record<string, unknown> = {};
    let notifyEmoji = "🤖";
    let notifyVerb = "";
    const entityLabel = action.entity_name || action.campaign_name || action.adset_id || action.campaign_id;

    if (action.action_type === "pause_adset" && action.adset_id) {
      const before = await fetchEntitySnapshot(token, action.adset_id);
      beforeSnap = { status: before.status, entity: action.adset_id };
      await postEntity(token, action.adset_id, { status: "PAUSED" });
      afterSnap = { status: "PAUSED", entity: action.adset_id };
      notifyEmoji = "⏸️"; notifyVerb = "группа на паузе";
      await admin.from("meta_creatives").update({ status: "PAUSED", effective_status: "PAUSED" }).eq("adset_id", action.adset_id);
    } else if (action.action_type === "pause_ad" && action.ad_id) {
      const before = await fetchEntitySnapshot(token, action.ad_id);
      beforeSnap = { status: before.status, entity: action.ad_id };
      await postEntity(token, action.ad_id, { status: "PAUSED" });
      afterSnap = { status: "PAUSED", entity: action.ad_id };
      notifyEmoji = "⏸️"; notifyVerb = "объявление на паузе";
      await admin.from("meta_creatives").update({ status: "PAUSED", effective_status: "PAUSED" }).eq("ad_id", action.ad_id);
    } else if (action.action_type === "duplicate_adset" && action.adset_id) {
      const statusOpt = String((action.after_value as any)?.status_option ?? "PAUSED");
      const copiedId = await duplicateAdset(token, action.adset_id, statusOpt);
      beforeSnap = { adset_id: action.adset_id };
      afterSnap = { copied_adset_id: copiedId, status_option: statusOpt };
      notifyEmoji = "📋"; notifyVerb = `создан дубль группы${copiedId ? ` · ${copiedId}` : ""}`;
    } else {
      const before = await fetchCampaignSnapshot(token, action.campaign_id);
      beforeSnap = {
        status: before.status,
        daily_budget: before.daily_budget ? Number(before.daily_budget) / 100 : null,
        lifetime_budget: before.lifetime_budget ? Number(before.lifetime_budget) / 100 : null,
      };

      if (action.action_type === "pause") {
        await postCampaign(token, action.campaign_id, { status: "PAUSED" });
        afterSnap = { ...beforeSnap, status: "PAUSED" };
        notifyEmoji = "⏸️"; notifyVerb = "поставлена на паузу";
      } else if (action.action_type === "resume") {
        await postCampaign(token, action.campaign_id, { status: "ACTIVE" });
        afterSnap = { ...beforeSnap, status: "ACTIVE" };
        notifyEmoji = "▶️"; notifyVerb = "возобновлена";
      } else if (action.action_type === "budget_cut" || action.action_type === "budget_bump") {
        const target = (action.after_value as any)?.daily_budget;
        if (!target || target <= 0) throw new Error("Target daily_budget missing");
        const cents = Math.round(Number(target) * 100);
        await postCampaign(token, action.campaign_id, { daily_budget: String(cents) });
        afterSnap = { ...beforeSnap, daily_budget: Number(target) };
        notifyEmoji = action.action_type === "budget_cut" ? "⬇️" : "⬆️";
        notifyVerb = `бюджет ${action.action_type === "budget_cut" ? "уменьшен" : "увеличен"} до ${Math.round(Number(target)).toLocaleString("ru-RU")}$/день`;
      }

      if (action.action_type === "pause") {
        await admin.from("meta_campaigns").update({ status: "PAUSED", effective_status: "PAUSED", last_synced_at: new Date().toISOString() }).eq("campaign_id", action.campaign_id);
      } else if (action.action_type === "resume") {
        await admin.from("meta_campaigns").update({ status: "ACTIVE", effective_status: "ACTIVE", last_synced_at: new Date().toISOString() }).eq("campaign_id", action.campaign_id);
      } else if (afterSnap.daily_budget) {
        await admin.from("meta_campaigns").update({ daily_budget: Number(afterSnap.daily_budget), last_synced_at: new Date().toISOString() }).eq("campaign_id", action.campaign_id);
      }
    }

    await admin.from("ad_auto_actions").update({
      status: "applied",
      before_value: beforeSnap,
      after_value: afterSnap,
      applied_at: new Date().toISOString(),
      applied_by: userId,
    }).eq("id", actionId);

    await notifyTelegram(
      admin,
      action.project_id,
      `${notifyEmoji} <b>Auto:</b> «${entityLabel}» ${notifyVerb}\n<i>${action.reason ?? ""}</i>`,
    );

    return json({ ok: true, before: beforeSnap, after: afterSnap });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    await admin.from("ad_auto_actions").update({
      status: "failed", error: msg, applied_at: new Date().toISOString(), applied_by: userId,
    }).eq("id", actionId);
    return json({ error: msg }, 502);
  }
});