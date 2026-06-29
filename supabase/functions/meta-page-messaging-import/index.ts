// Import existing Messenger welcome message + Ice Breakers from a Facebook Page
// into the local cabinet_message_templates table.
//
// Body: { cabinet_id: string }
//
// Reads cabinet.config.pageId and Meta tokens, calls
// GET /{page_id}/messenger_profile?fields=greeting,ice_breakers,persistent_menu
// using a page access token, and upserts a "Импортировано из Meta" template
// marked as synced. Returns the imported template payload.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { AUTH_CORS_HEADERS, requireUser, requireProjectAccess } from "../_lib/auth.ts";
import { resolveMetaTokens, tryMetaTokens } from "../_lib/meta_tokens.ts";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...AUTH_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const GRAPH = "https://graph.facebook.com/v21.0";

async function fetchPageAccessToken(pageId: string, userToken: string): Promise<string | null> {
  try {
    const r = await fetch(
      `${GRAPH}/${pageId}?fields=access_token&access_token=${encodeURIComponent(userToken)}`,
    );
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j?.access_token === "string" ? j.access_token : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: AUTH_CORS_HEADERS });

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: { cabinet_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const cabinetId = String(body?.cabinet_id || "");
  if (!cabinetId) return json({ error: "cabinet_id required" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: cabRow, error: cabErr } = await admin
    .from("ad_cabinets")
    .select("id, project_id, config, access_token, page_id, external_id")
    .eq("id", cabinetId)
    .maybeSingle();
  if (cabErr) return json({ error: cabErr.message }, 500);
  if (!cabRow) return json({ error: "cabinet_not_found" }, 404);

  const acc = await requireProjectAccess(auth.authHeader, cabRow.project_id as string);
  if (!acc.ok) return acc.response;

  const config = (cabRow.config ?? {}) as Record<string, unknown>;
  let pageId = String(
    (config as { pageId?: string })?.pageId
      || (cabRow as { page_id?: string | null }).page_id
      || "",
  );

  const candidateUserTokens = await resolveMetaTokens(
    (cabRow.access_token as string | null) ?? null,
  );
  if (candidateUserTokens.length === 0) {
    return json({ ok: false, error: "no_token", message: "Нет ни одного Meta access token" }, 400);
  }

  // Auto-discover page via ad account when not bound yet
  if (!pageId) {
    const extId = String((cabRow as { external_id?: string }).external_id || "");
    const actId = extId.startsWith("act_") ? extId : extId ? `act_${extId}` : "";
    if (actId) {
      for (const tok of candidateUserTokens) {
        try {
          const r = await fetch(
            `${GRAPH}/${actId}/promote_pages?fields=id,name&limit=1&access_token=${encodeURIComponent(tok)}`,
          );
          if (!r.ok) continue;
          const j = await r.json();
          const p = j?.data?.[0];
          if (p?.id) {
            pageId = String(p.id);
            await admin.from("ad_cabinets")
              .update({ page_id: pageId, page_name: p?.name ?? null })
              .eq("id", cabinetId);
            break;
          }
        } catch { /* try next */ }
      }
    }
  }

  if (!pageId) {
    return json({ ok: false, error: "no_page", message: "У кабинета не указана Facebook-страница. Привяжите страницу в настройках кабинета." }, 400);
  }

  // Strategy: scan existing ad creatives in the ad account for Click-to-Messenger /
  // Click-to-WhatsApp welcome message payloads. This uses ads_management permission,
  // which the cabinet token already has (avoids pages_messaging).
  const extId = String((cabRow as { external_id?: string }).external_id || "");
  const actId = extId.startsWith("act_") ? extId : extId ? `act_${extId}` : "";
  if (!actId) {
    return json({ ok: false, error: "no_act", message: "У кабинета не указан ad account" }, 400);
  }

  type Template = { name: string; greeting: string; iceBreakers: { question: string; answer: string }[] };
  const templates = new Map<string, Template>();

  const parseWelcome = (raw: unknown, fallbackName: string) => {
    if (!raw) return;
    let pwm: any = raw;
    if (typeof raw === "string") {
      try { pwm = JSON.parse(raw); } catch { return; }
    }
    // page_welcome_message can be { message: { text }, quick_replies: [...] }
    // or { welcome_message_flow: [{ messages: [...] }] }
    let greeting = "";
    const ice: { question: string; answer: string }[] = [];

    const collectMessages = (msgs: any[]) => {
      for (const m of msgs ?? []) {
        const t = m?.text || m?.message?.text;
        if (t && !greeting) greeting = String(t);
        const qrs = m?.quick_replies || m?.message?.quick_replies || [];
        for (const q of qrs) {
          const title = String(q?.title || q?.payload || "").trim();
          if (title) ice.push({ question: title, answer: "" });
        }
      }
    };

    if (Array.isArray(pwm?.welcome_message_flow)) {
      for (const step of pwm.welcome_message_flow) {
        collectMessages(step?.messages ?? []);
      }
    } else if (Array.isArray(pwm?.messages)) {
      collectMessages(pwm.messages);
    } else if (pwm?.message?.text || pwm?.text) {
      collectMessages([pwm]);
    }

    if (!greeting && ice.length === 0) return;

    const key = JSON.stringify({ greeting, ice });
    if (templates.has(key)) return;
    templates.set(key, { name: fallbackName, greeting, iceBreakers: ice });
  };

  const tryOne = async (userToken: string) => {
    const url = `${GRAPH}/${actId}/ads?fields=name,creative{object_story_spec,asset_feed_spec}&limit=200&access_token=${encodeURIComponent(userToken)}`;
    const r = await fetch(url);
    const text = await r.text();
    if (!r.ok) return { ok: false as const, error: text.slice(0, 500) };
    try {
      const j = JSON.parse(text);
      const ads: any[] = j?.data ?? [];
      for (const ad of ads) {
        const oss = ad?.creative?.object_story_spec;
        const candidates: unknown[] = [
          oss?.link_data?.page_welcome_message,
          oss?.video_data?.page_welcome_message,
          oss?.template_data?.page_welcome_message,
        ];
        for (const c of candidates) parseWelcome(c, `Из объявления: ${ad?.name || ad?.id}`);
      }
      return { ok: true as const, data: j };
    } catch {
      return { ok: false as const, error: "bad_json_response" };
    }
  };

  const result = await tryMetaTokens(candidateUserTokens, tryOne);
  if (!result.ok) {
    return json({ ok: false, error: "fetch_failed", message: `Meta API: ${result.error}` }, 400);
  }

  if (templates.size === 0) {
    return json({
      ok: true,
      imported: 0,
      message: "В объявлениях этого кабинета не найдено шаблонов приветствий (Click-to-Messenger / WhatsApp)",
    });
  }

  // Clear previous synced flags
  await admin
    .from("cabinet_message_templates")
    .update({ meta_sync_status: "local" })
    .eq("cabinet_id", cabinetId)
    .eq("meta_sync_status", "synced");

  let imported = 0;
  for (const tpl of templates.values()) {
    const payload = {
      cabinet_id: cabinetId,
      project_id: cabRow.project_id as string,
      name: tpl.name.slice(0, 200),
      greeting: tpl.greeting,
      ice_breakers: tpl.iceBreakers as unknown,
      cta_label: null,
      cta_payload: null,
      is_default: false,
      meta_sync_status: "synced",
      meta_synced_at: new Date().toISOString(),
      meta_last_error: null,
    };
    const { data: existing } = await admin
      .from("cabinet_message_templates")
      .select("id")
      .eq("cabinet_id", cabinetId)
      .eq("name", payload.name)
      .maybeSingle();
    if (existing?.id) {
      await admin.from("cabinet_message_templates").update(payload).eq("id", existing.id);
    } else {
      await admin.from("cabinet_message_templates").insert(payload);
    }
    imported++;
  }

  return json({ ok: true, imported });
});
