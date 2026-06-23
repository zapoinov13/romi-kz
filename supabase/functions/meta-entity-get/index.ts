// Read current settings of a Meta entity (campaign / adset / ad) for the
// duplicate-edit dialog. Returns a normalised payload the UI can prefill.
// POST { entity, meta_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { requireUser } from "../_lib/auth.ts";
import { resolveMetaTokens, tryMetaTokens } from "../_lib/meta_tokens.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GRAPH = "https://graph.facebook.com/v21.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Entity = "campaign" | "adset" | "ad";

async function verifyAccess(authHeader: string, entity: Entity, metaId: string): Promise<boolean> {
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  if (entity === "campaign") {
    const { data } = await client.from("meta_campaigns").select("id").eq("campaign_id", metaId).maybeSingle();
    return !!data;
  }
  if (entity === "ad") {
    const { data } = await client.from("meta_creatives").select("id").eq("ad_id", metaId).maybeSingle();
    return !!data;
  }
  const { data } = await client.from("meta_creatives").select("id").eq("adset_id", metaId).limit(1).maybeSingle();
  return !!data;
}

const FIELDS: Record<Entity, string> = {
  campaign: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,special_ad_categories,start_time,stop_time",
  adset: "id,name,status,effective_status,daily_budget,lifetime_budget,billing_event,optimization_goal,bid_strategy,destination_type,start_time,end_time,targeting,promoted_object,campaign_id",
  ad: "id,name,status,effective_status,adset_id,campaign_id,creative{id,thumbnail_url,image_url,video_id,object_story_spec,body,title,call_to_action_type,object_url}",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: { entity?: string; meta_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const entity = (body.entity ?? "").toLowerCase() as Entity;
  const metaId = (body.meta_id ?? "").trim();
  if (!["campaign", "adset", "ad"].includes(entity)) return json({ error: "entity must be campaign|adset|ad" }, 400);
  if (!/^\d+$/.test(metaId)) return json({ error: "meta_id (numeric) required" }, 400);

  if (!(await verifyAccess(auth.authHeader, entity, metaId))) return json({ error: "Нет доступа" }, 403);

  const tokens = await resolveMetaTokens();
  if (tokens.length === 0) return json({ error: "Meta token не настроен" }, 400);

  const result = await tryMetaTokens(tokens, async (token) => {
    const r = await fetch(`${GRAPH}/${metaId}?fields=${encodeURIComponent(FIELDS[entity])}&access_token=${encodeURIComponent(token)}`);
    const text = await r.text();
    if (!r.ok) {
      try {
        const err = JSON.parse(text) as { error?: { error_user_msg?: string; message?: string } };
        return { ok: false as const, error: err?.error?.error_user_msg ?? err?.error?.message ?? text.slice(0, 300) };
      } catch { return { ok: false as const, error: text.slice(0, 300) }; }
    }
    return { ok: true as const, data: JSON.parse(text) as Record<string, unknown> };
  });

  if (!result.ok) return json({ error: `Meta: ${result.error}` }, 502);

  // Also try to read account currency to render budgets correctly
  let currency = "USD";
  try {
    const data = result.data as Record<string, unknown>;
    const adAccountIdHint = (data.account_id as string | undefined)
      ?? null;
    if (adAccountIdHint) {
      const tok = tokens[0];
      const accRes = await fetch(`${GRAPH}/act_${adAccountIdHint}?fields=currency&access_token=${encodeURIComponent(tok)}`);
      if (accRes.ok) {
        const acc = await accRes.json() as { currency?: string };
        if (acc.currency) currency = acc.currency;
      }
    }
  } catch { /* ignore */ }

  return json({ ok: true, entity, data: result.data, currency });
});
