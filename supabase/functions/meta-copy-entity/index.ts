// Duplicate a Meta campaign / ad set / ad via Graph /copies endpoint.
// POST { entity: "campaign" | "adset" | "ad", meta_id: string,
//        rename_suffix?: string, status_option?: "PAUSED" | "ACTIVE" }
// Returns { ok, copied_id, copied_ids? }.

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
    const { data } = await client.from("meta_campaigns")
      .select("cabinet_id").eq("campaign_id", metaId).maybeSingle();
    return data ? { ok: true, cabinetId: (data as { cabinet_id: string }).cabinet_id } : { ok: false };
  }
  if (entity === "ad") {
    const { data } = await client.from("meta_creatives")
      .select("cabinet_id").eq("ad_id", metaId).maybeSingle();
    return data ? { ok: true, cabinetId: (data as { cabinet_id: string }).cabinet_id } : { ok: false };
  }
  const { data } = await client.from("meta_creatives")
    .select("cabinet_id").eq("adset_id", metaId).limit(1).maybeSingle();
  return data ? { ok: true, cabinetId: (data as { cabinet_id: string }).cabinet_id } : { ok: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: { entity?: string; meta_id?: string; rename_suffix?: string; status_option?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const entity = (body.entity ?? "").toLowerCase() as Entity;
  const metaId = (body.meta_id ?? "").trim();
  const renameSuffix = (body.rename_suffix ?? " - копия").slice(0, 80);
  const statusOption = (body.status_option ?? "PAUSED").toUpperCase();
  if (!["campaign", "adset", "ad"].includes(entity)) return json({ error: "entity must be campaign|adset|ad" }, 400);
  if (!/^\d+$/.test(metaId)) return json({ error: "meta_id (numeric) required" }, 400);
  if (!["PAUSED", "ACTIVE"].includes(statusOption)) return json({ error: "status_option must be PAUSED|ACTIVE" }, 400);

  const access = await verifyAccess(auth.authHeader, entity, metaId);
  if (!access.ok) return json({ error: "Нет доступа к объекту" }, 403);

  const tokens = await resolveMetaTokens();
  if (tokens.length === 0) return json({ error: "Meta token не настроен" }, 400);

  const result = await tryMetaTokens(tokens, async (token) => {
    const params = new URLSearchParams();
    params.set("access_token", token);
    params.set("rename_options", JSON.stringify({ rename_suffix: renameSuffix }));
    params.set("status_option", statusOption);
    if (entity === "campaign") {
      params.set("deep_copy", "true");
    }
    const r = await fetch(`${GRAPH}/${metaId}/copies`, {
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

  const payload = result.data as Record<string, unknown>;
  return json({
    ok: true,
    copied_id: payload.copied_campaign_id ?? payload.copied_adset_id ?? payload.copied_ad_id ?? payload.id ?? null,
    raw: payload,
  });
});
