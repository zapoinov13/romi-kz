// Duplicate a Meta entity (campaign / adset / ad) and optionally apply edits
// to the copy. Uses Graph /copies endpoint then PATCHes the new entity.
//
// POST {
//   entity: "campaign" | "adset" | "ad",
//   meta_id: string,
//   rename_suffix?: string,
//   new_name?: string,            // overrides rename_suffix when provided
//   status_option?: "PAUSED" | "ACTIVE",
//   edits?: {
//     // campaign
//     daily_budget?: number,      // major currency units (KZT, USD)
//     // adset
//     targeting_countries?: string[],   // ISO-2 codes
//     age_min?: number,
//     age_max?: number,
//     genders?: number[],         // [1] men, [2] women, omit = all
//     start_time?: string,
//     end_time?: string,
//     // ad (subset)
//   }
// }

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

async function metaPost(token: string, path: string, params: Record<string, string>): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false; error: string }
> {
  const body = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await r.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep */ }
  if (!r.ok) {
    const err = parsed as { error?: { error_user_msg?: string; message?: string } };
    return { ok: false, error: err?.error?.error_user_msg ?? err?.error?.message ?? text.slice(0, 300) };
  }
  return { ok: true, data: parsed as Record<string, unknown> };
}

async function metaGet(token: string, path: string, fields: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(`${GRAPH}/${path}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`);
  if (!r.ok) return null;
  return await r.json() as Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: {
    entity?: string; meta_id?: string;
    rename_suffix?: string; new_name?: string;
    status_option?: string;
    edits?: Record<string, unknown>;
  };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const entity = (body.entity ?? "").toLowerCase() as Entity;
  const metaId = (body.meta_id ?? "").trim();
  const newName = body.new_name?.toString().trim();
  const renameSuffix = newName ? null : (body.rename_suffix ?? " - копия").slice(0, 80);
  const statusOption = (body.status_option ?? "PAUSED").toUpperCase();
  const edits = body.edits ?? {};

  if (!["campaign", "adset", "ad"].includes(entity)) return json({ error: "entity must be campaign|adset|ad" }, 400);
  if (!/^\d+$/.test(metaId)) return json({ error: "meta_id (numeric) required" }, 400);
  if (!["PAUSED", "ACTIVE"].includes(statusOption)) return json({ error: "status_option must be PAUSED|ACTIVE" }, 400);

  if (!(await verifyAccess(auth.authHeader, entity, metaId))) return json({ error: "Нет доступа" }, 403);

  const tokens = await resolveMetaTokens();
  if (tokens.length === 0) return json({ error: "Meta token не настроен" }, 400);

  // Step 1: copy
  const copyResult = await tryMetaTokens(tokens, async (token) => {
    const params: Record<string, string> = { status_option: statusOption };
    if (entity === "campaign") params.deep_copy = "true";
    if (renameSuffix) params.rename_options = JSON.stringify({ rename_suffix: renameSuffix });
    return await metaPost(token, `${metaId}/copies`, params);
  });

  if (!copyResult.ok) return json({ error: `Meta: ${copyResult.error}` }, 502);

  const copyPayload = copyResult.data as Record<string, unknown>;
  const copiedId = (copyPayload.copied_campaign_id
    ?? copyPayload.copied_adset_id
    ?? copyPayload.copied_ad_id
    ?? copyPayload.id) as string | undefined;
  const workingToken = copyResult.token;

  const warnings: string[] = [];

  // Step 2: apply edits (best-effort). Failure here returns warning, not 502.
  if (copiedId) {
    // explicit name override (replaces the suffixed name)
    if (newName) {
      const r = await metaPost(workingToken, copiedId, { name: newName });
      if (!r.ok) warnings.push(`name: ${r.error}`);
    }

    if (entity === "campaign") {
      const dailyMajor = Number(edits.daily_budget ?? NaN);
      if (Number.isFinite(dailyMajor) && dailyMajor > 0) {
        // Meta budget in minor units (cents) for most currencies, KZT also uses minor units (tenge cents virtual).
        const minor = Math.round(dailyMajor * 100);
        const r = await metaPost(workingToken, copiedId, { daily_budget: String(minor) });
        if (!r.ok) warnings.push(`budget: ${r.error}`);
      }
    }

    if (entity === "adset") {
      const params: Record<string, string> = {};
      const dailyMajor = Number(edits.daily_budget ?? NaN);
      if (Number.isFinite(dailyMajor) && dailyMajor > 0) {
        params.daily_budget = String(Math.round(dailyMajor * 100));
      }
      if (typeof edits.start_time === "string" && edits.start_time) params.start_time = edits.start_time as string;
      if (typeof edits.end_time === "string" && edits.end_time) params.end_time = edits.end_time as string;

      // Targeting needs merge with current
      const wantsTargetingChange =
        Array.isArray(edits.targeting_countries)
        || typeof edits.age_min === "number"
        || typeof edits.age_max === "number"
        || Array.isArray(edits.genders);

      if (wantsTargetingChange) {
        const cur = await metaGet(workingToken, copiedId, "targeting");
        const targeting = (cur?.targeting as Record<string, unknown> | undefined) ?? {};
        if (Array.isArray(edits.targeting_countries) && (edits.targeting_countries as string[]).length > 0) {
          const geo = (targeting.geo_locations as Record<string, unknown> | undefined) ?? {};
          (geo as Record<string, unknown>).countries = (edits.targeting_countries as string[]).map((s) => String(s).toUpperCase());
          targeting.geo_locations = geo;
        }
        if (typeof edits.age_min === "number") targeting.age_min = edits.age_min;
        if (typeof edits.age_max === "number") targeting.age_max = edits.age_max;
        if (Array.isArray(edits.genders) && (edits.genders as number[]).length > 0) {
          targeting.genders = edits.genders;
        } else if (Array.isArray(edits.genders) && (edits.genders as number[]).length === 0) {
          delete (targeting as Record<string, unknown>).genders;
        }
        params.targeting = JSON.stringify(targeting);
      }

      if (Object.keys(params).length > 0) {
        const r = await metaPost(workingToken, copiedId, params);
        if (!r.ok) warnings.push(`adset: ${r.error}`);
      }
    }

    if (entity === "ad") {
      const eBody = (edits.creative_body as string | undefined) ?? undefined;
      const eTitle = (edits.creative_title as string | undefined) ?? undefined;
      const eDesc = (edits.creative_description as string | undefined) ?? undefined;
      const eLink = (edits.creative_link_url as string | undefined) ?? undefined;
      const eCta = (edits.creative_cta as string | undefined) ?? undefined;
      const eImageB64 = (edits.creative_image_b64 as string | undefined) ?? undefined;

      const needsCreativeChange = !!(eBody || eTitle || eDesc || eLink || eCta || eImageB64);
      if (needsCreativeChange) {
        try {
          const adInfo = await metaGet(
            workingToken,
            copiedId,
            "account_id,creative{id,name,object_story_spec,asset_feed_spec,object_type}",
          );
          if (!adInfo) throw new Error("не удалось прочитать объявление");
          const accountId = adInfo.account_id as string | undefined;
          const cr = adInfo.creative as Record<string, unknown> | undefined;
          const spec = cr?.object_story_spec as Record<string, unknown> | undefined;
          if (!accountId || !spec) throw new Error("у объявления нет object_story_spec (динамический креатив)");
          const linkData = spec.link_data as Record<string, unknown> | undefined;
          const videoData = spec.video_data as Record<string, unknown> | undefined;
          const target = linkData ?? videoData;
          if (!target) throw new Error("нет link_data/video_data для редактирования");

          let newImageHash: string | null = null;
          if (eImageB64 && linkData) {
            const clean = eImageB64.replace(/^data:[^;]+;base64,/, "");
            const imgParams = new URLSearchParams({ bytes: clean, access_token: workingToken });
            const imgRes = await fetch(`${GRAPH}/act_${accountId}/adimages`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: imgParams.toString(),
            });
            const imgText = await imgRes.text();
            if (!imgRes.ok) throw new Error(`adimages: ${imgText.slice(0, 200)}`);
            const imgPayload = JSON.parse(imgText) as { images?: Record<string, { hash?: string }> };
            const first = Object.values(imgPayload.images ?? {})[0];
            if (!first?.hash) throw new Error("Meta не вернула hash картинки");
            newImageHash = first.hash;
          }

          if (eBody !== undefined) target.message = eBody;
          if (eTitle !== undefined) target.name = eTitle;
          if (eDesc !== undefined) target.description = eDesc;
          if (eLink !== undefined) target.link = eLink;
          if (eCta !== undefined) {
            const cur = (target.call_to_action as Record<string, unknown> | undefined) ?? {};
            cur.type = String(eCta).toUpperCase();
            if (eLink !== undefined) cur.value = { link: eLink };
            target.call_to_action = cur;
          }
          if (newImageHash && linkData) {
            linkData.image_hash = newImageHash;
            delete (linkData as Record<string, unknown>).picture;
          }

          const newSpec: Record<string, unknown> = { ...spec };
          if (linkData) newSpec.link_data = target;
          if (videoData && !linkData) newSpec.video_data = target;

          const createParams = new URLSearchParams({
            name: (cr?.name as string | undefined) ?? `creative_${copiedId}`,
            object_story_spec: JSON.stringify(newSpec),
            access_token: workingToken,
          });
          const createRes = await fetch(`${GRAPH}/act_${accountId}/adcreatives`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: createParams.toString(),
          });
          const createText = await createRes.text();
          if (!createRes.ok) throw new Error(`adcreatives: ${createText.slice(0, 200)}`);
          const createPayload = JSON.parse(createText) as { id?: string };
          const newCreativeId = createPayload.id;
          if (!newCreativeId) throw new Error("Meta не вернула id креатива");

          const attach = await metaPost(workingToken, copiedId, {
            creative: JSON.stringify({ creative_id: newCreativeId }),
          });
          if (!attach.ok) throw new Error(attach.error);
        } catch (e) {
          warnings.push(`creative: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  return json({
    ok: true,
    copied_id: copiedId ?? null,
    raw: copyPayload,
    warnings: warnings.length ? warnings : undefined,
  });
});
