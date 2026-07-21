import { requireProjectAccess, requireUser } from "../_lib/auth.ts";
import { getMetaAppId, getMetaAppSecret } from "../_lib/meta_connect_helpers.ts";
import { adminClient, WA_CORS, WA_GRAPH, waJson } from "../_lib/wa_cloud.ts";

/**
 * Completes Meta Embedded Signup (Coexistence).
 * Body: { code, waba_id, phone_number_id, project_id, cabinet_id, display_phone?, display_name? }
 *
 * IMPORTANT: Do NOT call standard /register for coexistence numbers —
 * that would disconnect WhatsApp Business App.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: WA_CORS });
  if (req.method !== "POST") return waJson({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const wabaId = typeof body.waba_id === "string" ? body.waba_id.trim() : "";
  const phoneNumberId = typeof body.phone_number_id === "string" ? body.phone_number_id.trim() : "";
  const projectId = typeof body.project_id === "string" ? body.project_id.trim() : "";
  const cabinetId = typeof body.cabinet_id === "string" ? body.cabinet_id.trim() : "";
  const displayPhone = typeof body.display_phone === "string" ? body.display_phone.trim() : null;
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : null;

  if (!projectId || !cabinetId) {
    return waJson({ error: "project_id и cabinet_id обязательны" }, 400);
  }
  if (!code && !phoneNumberId) {
    return waJson({ error: "Нужен code из Embedded Signup или phone_number_id" }, 400);
  }

  const access = await requireProjectAccess(auth.authHeader, projectId);
  if (!access.ok) return access.response;

  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  if (!appId || !appSecret) {
    return waJson({ error: "META_APP_ID / META_APP_SECRET не настроены" }, 500);
  }

  let accessToken = "";
  try {
    if (code) {
      // Exchange Embedded Signup code for business token
      const tokenUrl = new URL(`${WA_GRAPH}/oauth/access_token`);
      tokenUrl.searchParams.set("client_id", appId);
      tokenUrl.searchParams.set("client_secret", appSecret);
      tokenUrl.searchParams.set("code", code);
      const tr = await fetch(tokenUrl);
      const tj = await tr.json().catch(() => ({}));
      if (!tr.ok || !tj?.access_token) {
        return waJson({
          error: tj?.error?.message ?? "Не удалось обменять code на токен",
          details: tj,
        }, 400);
      }
      accessToken = String(tj.access_token);
    } else if (typeof body.access_token === "string" && body.access_token.trim()) {
      // Fallback for testing / already exchanged
      accessToken = body.access_token.trim();
    } else {
      return waJson({ error: "code или access_token обязателен" }, 400);
    }
  } catch (e) {
    return waJson({ error: e instanceof Error ? e.message : String(e) }, 500);
  }

  let resolvedWaba = wabaId;
  let resolvedPhoneId = phoneNumberId;
  let resolvedDisplayPhone = displayPhone;
  let resolvedDisplayName = displayName;

  // If IDs missing, try to discover from token debug / shared WABAs
  if (!resolvedWaba || !resolvedPhoneId) {
    try {
      const debugUrl = new URL(`${WA_GRAPH}/debug_token`);
      debugUrl.searchParams.set("input_token", accessToken);
      debugUrl.searchParams.set("access_token", `${appId}|${appSecret}`);
      const dr = await fetch(debugUrl);
      const dj = await dr.json().catch(() => ({}));
      const granular = (dj?.data?.granular_scopes ?? []) as Array<{
        scope?: string;
        target_ids?: string[];
      }>;
      const wabaScope = granular.find((g) =>
        (g.scope ?? "").includes("whatsapp_business") && (g.target_ids?.length ?? 0) > 0
      );
      if (!resolvedWaba && wabaScope?.target_ids?.[0]) {
        resolvedWaba = String(wabaScope.target_ids[0]);
      }
    } catch (e) {
      console.warn("wa-complete: debug_token failed", e);
    }
  }

  if (resolvedWaba && !resolvedPhoneId) {
    try {
      const pr = await fetch(
        `${WA_GRAPH}/${resolvedWaba}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${encodeURIComponent(accessToken)}`,
      );
      const pj = await pr.json().catch(() => ({}));
      const first = (pj?.data ?? [])[0] as {
        id?: string;
        display_phone_number?: string;
        verified_name?: string;
      } | undefined;
      if (first?.id) {
        resolvedPhoneId = String(first.id);
        resolvedDisplayPhone = resolvedDisplayPhone || first.display_phone_number || null;
        resolvedDisplayName = resolvedDisplayName || first.verified_name || null;
      }
    } catch (e) {
      console.warn("wa-complete: phone_numbers fetch failed", e);
    }
  }

  if (!resolvedWaba || !resolvedPhoneId) {
    return waJson({
      error: "Не удалось определить waba_id / phone_number_id. Передайте их из sessionInfo Embedded Signup.",
      got: { waba_id: resolvedWaba || null, phone_number_id: resolvedPhoneId || null },
    }, 400);
  }

  // Enrich display fields if still empty
  if (!resolvedDisplayPhone || !resolvedDisplayName) {
    try {
      const pr = await fetch(
        `${WA_GRAPH}/${resolvedPhoneId}?fields=display_phone_number,verified_name&access_token=${encodeURIComponent(accessToken)}`,
      );
      const pj = await pr.json().catch(() => ({}));
      resolvedDisplayPhone = resolvedDisplayPhone || pj?.display_phone_number || null;
      resolvedDisplayName = resolvedDisplayName || pj?.verified_name || null;
    } catch { /* best-effort */ }
  }

  const admin = adminClient();

  // Clear previous binding for this cabinet (unique cabinet constraint)
  await admin.from("whatsapp_accounts").delete().eq("cabinet_id", cabinetId);

  const { data: accountId, error: bindErr } = await admin.rpc("bind_whatsapp_account", {
    p_project_id: projectId,
    p_cabinet_id: cabinetId,
    p_waba_id: resolvedWaba,
    p_phone_number_id: resolvedPhoneId,
    p_access_token: accessToken,
    p_display_phone: resolvedDisplayPhone,
    p_display_name: resolvedDisplayName,
    p_onboarding_mode: "coexistence",
  });

  if (bindErr) {
    return waJson({ error: bindErr.message }, 500);
  }

  // Subscribe app to WABA webhooks (required for incoming messages)
  let subscribed = false;
  let subscribeError: string | null = null;
  try {
    const sub = await fetch(`${WA_GRAPH}/${resolvedWaba}/subscribed_apps`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    const sj = await sub.json().catch(() => ({}));
    subscribed = sub.ok && (sj?.success === true || sj?.success === undefined);
    if (!sub.ok) subscribeError = sj?.error?.message ?? `HTTP ${sub.status}`;
  } catch (e) {
    subscribeError = e instanceof Error ? e.message : String(e);
  }

  // Ensure project has CRM pipeline
  await admin.rpc("ensure_project_pipeline", { p_project_id: projectId }).catch(() => null);

  return waJson({
    ok: true,
    accountId,
    waba_id: resolvedWaba,
    phone_number_id: resolvedPhoneId,
    display_phone: resolvedDisplayPhone,
    display_name: resolvedDisplayName,
    subscribed,
    subscribeError,
    note: "Coexistence: номер остаётся в WhatsApp Business App. Не вызывайте /register.",
  });
});
