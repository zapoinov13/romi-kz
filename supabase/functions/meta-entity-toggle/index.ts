// Universal Meta-entity status toggle (campaign / adset / ad).
// POST { entity: "campaign" | "adset" | "ad", meta_id: string, status: "ACTIVE" | "PAUSED" }
// Uses multi-token resolver (meta_tokens table + legacy fallbacks).

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
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Entity = "campaign" | "adset" | "ad";

async function verifyAccess(
  authHeader: string,
  entity: Entity,
  metaId: string,
): Promise<{ ok: boolean; cabinetId?: string }> {
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  if (entity === "campaign") {
    const { data } = await client
      .from("meta_campaigns")
      .select("cabinet_id")
      .eq("campaign_id", metaId)
      .maybeSingle();
    if (!data) return { ok: false };
    return { ok: true, cabinetId: (data as { cabinet_id: string }).cabinet_id };
  }
  if (entity === "ad") {
    const { data } = await client
      .from("meta_creatives")
      .select("cabinet_id")
      .eq("ad_id", metaId)
      .maybeSingle();
    if (!data) return { ok: false };
    return { ok: true, cabinetId: (data as { cabinet_id: string }).cabinet_id };
  }
  // adset: not stored locally - verify via any creative in this adset
  const { data } = await client
    .from("meta_creatives")
    .select("cabinet_id")
    .eq("adset_id", metaId)
    .limit(1)
    .maybeSingle();
  if (data) return { ok: true, cabinetId: (data as { cabinet_id: string }).cabinet_id };
  return { ok: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: { entity?: string; meta_id?: string; status?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const entity = (body.entity ?? "").toLowerCase() as Entity;
  const metaId = (body.meta_id ?? "").trim();
  const status = (body.status ?? "").toUpperCase();
  if (!["campaign", "adset", "ad"].includes(entity)) return json({ error: "entity must be campaign|adset|ad" }, 400);
  if (!/^\d+$/.test(metaId)) return json({ error: "meta_id (numeric) required" }, 400);
  if (!["ACTIVE", "PAUSED"].includes(status)) return json({ error: "status must be ACTIVE|PAUSED" }, 400);

  const access = await verifyAccess(auth.authHeader, entity, metaId);
  if (!access.ok) return json({ error: "Нет доступа к объекту" }, 403);

  const tokens = await resolveMetaTokens();
  if (tokens.length === 0) return json({ error: "Meta token не настроен" }, 400);

  const result = await tryMetaTokens(tokens, async (token) => {
    const params = new URLSearchParams();
    params.set("status", status);
    params.set("access_token", token);
    const r = await fetch(`${GRAPH}/${metaId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const text = await r.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep text */ }
    if (!r.ok) {
      const err = parsed as { error?: { error_user_msg?: string; message?: string } };
      return { ok: false as const, error: err?.error?.error_user_msg ?? err?.error?.message ?? text.slice(0, 300) };
    }
    return { ok: true as const, data: parsed };
  });

  if (!result.ok) return json({ error: `Meta: ${result.error}` }, 502);

  // Mirror locally where possible.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const nowIso = new Date().toISOString();
  if (entity === "campaign") {
    await admin.from("meta_campaigns")
      .update({ status, effective_status: status, last_synced_at: nowIso })
      .eq("campaign_id", metaId);
  } else if (entity === "ad") {
    await admin.from("meta_creatives")
      .update({ status, effective_status: status, last_synced_at: nowIso })
      .eq("ad_id", metaId);
  }

  return json({ ok: true, status });
});
