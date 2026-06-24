// Apply a saved welcome-message template to a Facebook Page as Messenger
// "Ice Breakers" + greeting via Graph API.
//
// Body: { template_id: string }
//
// Reads cabinet.page_id and cabinet access_token (or a global Meta token),
// pushes greeting + ice_breakers to /{page_id}/messenger_profile, marks the
// template as synced/error in the DB and clears other templates' synced flag
// for the same cabinet.

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

interface IceBreaker { question: string; answer: string; }

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

  let body: { template_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const templateId = String(body?.template_id || "");
  if (!templateId) return json({ error: "template_id required" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: tplRow, error: tplErr } = await admin
    .from("cabinet_message_templates")
    .select("id, cabinet_id, project_id, greeting, ice_breakers, name")
    .eq("id", templateId)
    .maybeSingle();
  if (tplErr) return json({ error: tplErr.message }, 500);
  if (!tplRow) return json({ error: "template_not_found" }, 404);

  const acc = await requireProjectAccess(auth.authHeader, tplRow.project_id as string);
  if (!acc.ok) return acc.response;

  // Cabinet → page_id + optional cabinet access_token
  const { data: cabRow, error: cabErr } = await admin
    .from("ad_cabinets")
    .select("id, config, access_token")
    .eq("id", tplRow.cabinet_id as string)
    .maybeSingle();
  if (cabErr) return json({ error: cabErr.message }, 500);
  if (!cabRow) return json({ error: "cabinet_not_found" }, 404);

  const config = (cabRow.config ?? {}) as Record<string, unknown>;
  const pageId = String((config as { pageId?: string })?.pageId || "");
  if (!pageId) {
    return markErrorAndReturn(admin, templateId, "У кабинета не указана Facebook-страница (pageId)");
  }

  const greeting = String(tplRow.greeting || "").trim();
  const rawIB = Array.isArray(tplRow.ice_breakers) ? tplRow.ice_breakers as IceBreaker[] : [];
  const iceBreakers = rawIB
    .map((x) => ({
      question: String(x?.question ?? "").trim().slice(0, 80),
      answer: String(x?.answer ?? "").trim().slice(0, 1000),
    }))
    .filter((x) => x.question);

  if (!greeting && iceBreakers.length === 0) {
    return markErrorAndReturn(admin, templateId, "Шаблон пуст: нет ни приветствия, ни вопросов");
  }

  // Find a working token; prefer cabinet token, then global pool.
  const candidateUserTokens = await resolveMetaTokens(
    (cabRow.access_token as string | null) ?? null,
  );
  if (candidateUserTokens.length === 0) {
    return markErrorAndReturn(admin, templateId, "Нет ни одного Meta access token");
  }

  const profile: Record<string, unknown> = {};
  if (greeting) {
    profile.greeting = [{ locale: "default", text: greeting.slice(0, 600) }];
  }
  if (iceBreakers.length > 0) {
    profile.ice_breakers = [{
      locale: "default",
      call_to_actions: iceBreakers.map((ib, idx) => ({
        question: ib.question,
        payload: `WELCOME_TEMPLATE_${templateId}_${idx}`,
      })),
    }];
  }

  // For messenger_profile we need a PAGE access token. Exchange user → page token.
  const tryOne = async (userToken: string) => {
    const pageToken = await fetchPageAccessToken(pageId, userToken);
    if (!pageToken) {
      return { ok: false as const, error: "page_token_unavailable" };
    }
    const r = await fetch(`${GRAPH}/${pageId}/messenger_profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profile, access_token: pageToken }),
    });
    const text = await r.text();
    if (!r.ok) {
      return { ok: false as const, error: text.slice(0, 500) };
    }
    return { ok: true as const, data: text };
  };

  const result = await tryMetaTokens(candidateUserTokens, tryOne);

  if (!result.ok) {
    return markErrorAndReturn(admin, templateId, `Meta API: ${result.error}`);
  }

  // Mark this template as synced; clear synced status on siblings.
  await admin
    .from("cabinet_message_templates")
    .update({ meta_sync_status: "local", meta_last_error: null })
    .eq("cabinet_id", tplRow.cabinet_id as string)
    .neq("id", templateId)
    .eq("meta_sync_status", "synced");

  await admin
    .from("cabinet_message_templates")
    .update({
      meta_sync_status: "synced",
      meta_synced_at: new Date().toISOString(),
      meta_last_error: null,
    })
    .eq("id", templateId);

  return json({ ok: true, message: "Шаблон применён в Meta" });
});

async function markErrorAndReturn(
  admin: ReturnType<typeof createClient>,
  templateId: string,
  message: string,
) {
  await admin
    .from("cabinet_message_templates")
    .update({
      meta_sync_status: "error",
      meta_last_error: message.slice(0, 500),
    })
    .eq("id", templateId);
  return json({ ok: false, error: "sync_failed", message }, 400);
}
