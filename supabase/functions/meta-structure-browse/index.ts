// Live Meta Graph browser for ad structure children.
// POST { cabinet_id: string, level: "adsets" | "ads", parent_id: string }
//   level=adsets → returns ad sets of a campaign
//   level=ads    → returns ads of an ad set
// Uses multi-token resolver and tries each token in priority order.

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

async function fetchPaged(url: string, token: string): Promise<unknown[]> {
  const out: unknown[] = [];
  let next: string | null = `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  let safety = 10;
  while (next && safety-- > 0) {
    const r = await fetch(next);
    const text = await r.text();
    if (!r.ok) throw new Error(text.slice(0, 300));
    const body = JSON.parse(text) as { data?: unknown[]; paging?: { next?: string } };
    if (Array.isArray(body.data)) out.push(...body.data);
    next = body.paging?.next ?? null;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: { cabinet_id?: string; level?: string; parent_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const cabinetId = (body.cabinet_id ?? "").trim();
  const level = (body.level ?? "").toLowerCase();
  const parentId = (body.parent_id ?? "").trim();
  if (!cabinetId) return json({ error: "cabinet_id required" }, 400);
  if (!["adsets", "ads"].includes(level)) return json({ error: "level must be adsets|ads" }, 400);
  if (!/^\d+$/.test(parentId)) return json({ error: "parent_id (numeric) required" }, 400);

  // RLS check via user client
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth.authHeader } }, auth: { persistSession: false } },
  );
  const { data: cab } = await userClient
    .from("ad_cabinets")
    .select("id")
    .eq("id", cabinetId)
    .maybeSingle();
  if (!cab) return json({ error: "Нет доступа к кабинету" }, 403);

  const tokens = await resolveMetaTokens();
  if (tokens.length === 0) return json({ error: "Meta token не настроен" }, 400);

  const fields = level === "adsets"
    ? [
      "id", "name", "status", "effective_status",
      "daily_budget", "lifetime_budget",
      "optimization_goal", "billing_event", "destination_type",
      "start_time", "end_time",
    ].join(",")
    : [
      "id", "name", "status", "effective_status", "adset_id", "campaign_id",
      "creative{thumbnail_url,image_url,video_id,object_story_spec,body,title,call_to_action_type,object_url}",
    ].join(",");

  const path = level === "adsets" ? "adsets" : "ads";
  const url = `${GRAPH}/${parentId}/${path}?fields=${fields}&limit=100`;

  const result = await tryMetaTokens(tokens, async (token) => {
    try {
      const rows = await fetchPaged(url, token);
      return { ok: true as const, data: rows };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

  if (!result.ok) return json({ error: `Meta: ${result.error}` }, 502);

  // Normalize a bit
  const items = (result.data as Array<Record<string, unknown>>).map((r) => {
    const out: Record<string, unknown> = { ...r };
    if (typeof r.daily_budget === "string") out.daily_budget = Number(r.daily_budget) / 100;
    if (typeof r.lifetime_budget === "string") out.lifetime_budget = Number(r.lifetime_budget) / 100;
    if (level === "ads") {
      const cr = r.creative as Record<string, unknown> | undefined;
      out.thumbnail_url = (cr?.thumbnail_url as string | undefined)
        ?? (cr?.image_url as string | undefined) ?? null;
    }
    return out;
  });

  return json({ ok: true, items });
});
