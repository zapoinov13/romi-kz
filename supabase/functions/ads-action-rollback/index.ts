// Rolls back a previously applied ad_auto_actions row by re-applying its before_value.
// POST { action_id: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  let body: { action_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const actionId = (body.action_id ?? "").trim();
  if (!actionId) return json({ error: "action_id required" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: action } = await admin.from("ad_auto_actions").select("*").eq("id", actionId).maybeSingle();
  if (!action) return json({ error: "Action not found" }, 404);
  if (action.status !== "applied") return json({ error: `Cannot rollback ${action.status} action` }, 409);

  const { data: access } = await admin.rpc("user_can_access_project", { _project_id: action.project_id });
  if (!access) return json({ error: "Forbidden" }, 403);

  // Determine inverse action_type and target after_value (= original before_value)
  const before = action.before_value as any;
  let inverse: "pause" | "resume" | "budget_cut" | "budget_bump";
  const after: Record<string, unknown> = {};
  if (action.action_type === "pause") {
    inverse = "resume";
    after.status = "ACTIVE";
  } else if (action.action_type === "resume") {
    inverse = "pause";
    after.status = "PAUSED";
  } else if (action.action_type === "budget_cut") {
    inverse = "budget_bump";
    after.daily_budget = before?.daily_budget;
  } else {
    inverse = "budget_cut";
    after.daily_budget = before?.daily_budget;
  }

  // Create rollback action row
  const { data: rollback, error: insErr } = await admin.from("ad_auto_actions").insert({
    cabinet_id: action.cabinet_id,
    project_id: action.project_id,
    campaign_id: action.campaign_id,
    campaign_name: action.campaign_name,
    action_type: inverse,
    trigger: "rollback",
    mode: "enforce",
    reason: `Откат действия ${action.id}`,
    after_value: after,
    parent_action_id: action.id,
    status: "pending",
  }).select("id").single();
  if (insErr || !rollback) return json({ error: insErr?.message || "Insert failed" }, 500);

  // Execute via executor function
  const execResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ads-action-executor`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ action_id: rollback.id }),
  });
  const execData = await execResp.json().catch(() => ({}));
  if (!execResp.ok) return json({ error: execData?.error || "Executor failed" }, 502);

  await admin.from("ad_auto_actions").update({ status: "rolled_back" }).eq("id", action.id);

  return json({ ok: true, rollback_id: rollback.id });
});