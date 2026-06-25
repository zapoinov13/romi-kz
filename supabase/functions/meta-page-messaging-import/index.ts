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
    .select("id, project_id, config, access_token")
    .eq("id", cabinetId)
    .maybeSingle();
  if (cabErr) return json({ error: cabErr.message }, 500);
  if (!cabRow) return json({ error: "cabinet_not_found" }, 404);

  const acc = await requireProjectAccess(auth.authHeader, cabRow.project_id as string);
  if (!acc.ok) return acc.response;

  const config = (cabRow.config ?? {}) as Record<string, unknown>;
  const pageId = String((config as { pageId?: string })?.pageId || "");
  if (!pageId) {
    return json({ ok: false, error: "no_page", message: "У кабинета не указана Facebook-страница" }, 400);
  }

  const candidateUserTokens = await resolveMetaTokens(
    (cabRow.access_token as string | null) ?? null,
  );
  if (candidateUserTokens.length === 0) {
    return json({ ok: false, error: "no_token", message: "Нет ни одного Meta access token" }, 400);
  }

  const tryOne = async (userToken: string) => {
    const pageToken = await fetchPageAccessToken(pageId, userToken);
    if (!pageToken) return { ok: false as const, error: "page_token_unavailable" };
    const r = await fetch(
      `${GRAPH}/${pageId}/messenger_profile?fields=greeting,ice_breakers&access_token=${encodeURIComponent(pageToken)}`,
    );
    const text = await r.text();
    if (!r.ok) return { ok: false as const, error: text.slice(0, 500) };
    try {
      return { ok: true as const, data: JSON.parse(text) };
    } catch {
      return { ok: false as const, error: "bad_json_response" };
    }
  };

  const result = await tryMetaTokens(candidateUserTokens, tryOne);
  if (!result.ok) {
    return json({ ok: false, error: "fetch_failed", message: `Meta API: ${result.error}` }, 400);
  }

  const profile = (result.data as { data?: Array<Record<string, unknown>> })?.data?.[0]
    || (result.data as Record<string, unknown>);

  const greetingArr = (profile?.greeting as Array<{ locale?: string; text?: string }> | undefined) ?? [];
  const greeting =
    greetingArr.find((x) => x?.locale === "default")?.text
    || greetingArr[0]?.text
    || "";

  const iceArr = (profile?.ice_breakers as Array<{ locale?: string; call_to_actions?: Array<{ question?: string; payload?: string }> }> | undefined) ?? [];
  const ice = iceArr.find((x) => x?.locale === "default") || iceArr[0];
  const iceBreakers = (ice?.call_to_actions ?? []).map((c) => ({
    question: String(c?.question ?? "").trim(),
    answer: "",
  })).filter((x) => x.question);

  if (!greeting && iceBreakers.length === 0) {
    return json({
      ok: true,
      imported: 0,
      message: "В Meta нет настроенного приветствия или быстрых ответов на этой странице",
    });
  }

  // Upsert: look for an existing "import" template (we keep one synced row per cabinet)
  const name = "Импортировано из Meta";
  const { data: existing } = await admin
    .from("cabinet_message_templates")
    .select("id")
    .eq("cabinet_id", cabinetId)
    .eq("name", name)
    .maybeSingle();

  // clear previous synced flag on siblings
  await admin
    .from("cabinet_message_templates")
    .update({ meta_sync_status: "local" })
    .eq("cabinet_id", cabinetId)
    .eq("meta_sync_status", "synced");

  const payload = {
    cabinet_id: cabinetId,
    project_id: cabRow.project_id as string,
    name,
    greeting,
    ice_breakers: iceBreakers as unknown,
    cta_label: null,
    cta_payload: null,
    is_default: false,
    meta_sync_status: "synced",
    meta_synced_at: new Date().toISOString(),
    meta_last_error: null,
  };

  if (existing?.id) {
    const { error: upErr } = await admin
      .from("cabinet_message_templates")
      .update(payload)
      .eq("id", existing.id);
    if (upErr) return json({ ok: false, error: upErr.message }, 500);
    return json({ ok: true, imported: 1, template_id: existing.id, updated: true });
  } else {
    const { data: ins, error: insErr } = await admin
      .from("cabinet_message_templates")
      .insert(payload)
      .select("id")
      .single();
    if (insErr) return json({ ok: false, error: insErr.message }, 500);
    return json({ ok: true, imported: 1, template_id: ins?.id, updated: false });
  }
});
