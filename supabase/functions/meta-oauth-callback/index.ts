import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchMe,
  getFrontendUrl,
  validateMarketingPermissions,
} from "../_lib/meta_connect_helpers.ts";

function redirectTo(path: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: path },
  });
}

function buildReturnUrl(
  returnTo: string,
  params: Record<string, string>,
): string {
  const base = getFrontendUrl();
  const path = returnTo.startsWith("/") ? returnTo : "/settings?tab=meta";
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const fbError = url.searchParams.get("error");
    const fbErrorDesc = url.searchParams.get("error_description");
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: stateRow } = await admin
      .from("meta_oauth_states")
      .select("state, user_id, return_to, label, expires_at")
      .eq("state", state)
      .maybeSingle();

    const returnTo = stateRow?.return_to ?? "/settings?tab=meta";

    if (fbError) {
      return redirectTo(buildReturnUrl(returnTo, {
        meta_oauth: "error",
        message: fbErrorDesc ?? fbError,
      }));
    }

    if (!state || !stateRow) {
      return redirectTo(buildReturnUrl("/settings?tab=meta", {
        meta_oauth: "error",
        message: "Недействительная сессия OAuth. Попробуйте снова.",
      }));
    }

    if (new Date(stateRow.expires_at as string).getTime() < Date.now()) {
      await admin.from("meta_oauth_states").delete().eq("state", state);
      return redirectTo(buildReturnUrl(returnTo, {
        meta_oauth: "error",
        message: "Сессия OAuth истекла. Попробуйте снова.",
      }));
    }

    if (!code) {
      return redirectTo(buildReturnUrl(returnTo, {
        meta_oauth: "error",
        message: "Facebook не вернул код авторизации",
      }));
    }

    const short = await exchangeCodeForToken(code);
    if ("error" in short) {
      return redirectTo(buildReturnUrl(returnTo, {
        meta_oauth: "error",
        message: short.error,
      }));
    }

    const long = await exchangeForLongLivedToken(short.access_token);
    const token = "error" in long ? short.access_token : long.access_token;
    const expiresIn = "error" in long ? short.expires_in : long.expires_in;

    const me = await fetchMe(token);
    if ("error" in me) {
      return redirectTo(buildReturnUrl(returnTo, {
        meta_oauth: "error",
        message: me.error,
      }));
    }

    const permErr = await validateMarketingPermissions(token);
    if (permErr) {
      return redirectTo(buildReturnUrl(returnTo, {
        meta_oauth: "error",
        message: permErr,
      }));
    }

    const label = (stateRow.label as string | null)?.trim() || me.name || "Meta аккаунт";
    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();

    const userId = stateRow.user_id as string;

    const { data: existing } = await admin
      .from("meta_tokens")
      .select("id")
      .eq("created_by", userId)
      .eq("fb_user_id", me.id)
      .maybeSingle();

    const row = {
      label,
      access_token: token,
      fb_user_id: me.id,
      fb_user_name: me.name,
      created_by: userId,
      token_expires_at: tokenExpiresAt,
      source: "oauth",
      scopes: [
        "ads_read",
        "ads_management",
        "business_management",
        "pages_show_list",
        "instagram_basic",
      ],
    };

    if (existing?.id) {
      const { error: updErr } = await admin
        .from("meta_tokens")
        .update(row)
        .eq("id", existing.id);
      if (updErr) {
        return redirectTo(buildReturnUrl(returnTo, {
          meta_oauth: "error",
          message: updErr.message,
        }));
      }
    } else {
      const { error: insErr } = await admin.from("meta_tokens").insert(row);
      if (insErr) {
        return redirectTo(buildReturnUrl(returnTo, {
          meta_oauth: "error",
          message: insErr.message,
        }));
      }
    }

    await admin.from("meta_oauth_states").delete().eq("state", state);

    // Legacy fallback for older code paths
    await admin
      .from("automation_settings")
      .upsert({ id: true, meta_access_token: token }, { onConflict: "id" });

    return redirectTo(buildReturnUrl(returnTo, {
      meta_oauth: "success",
      fb_name: me.name,
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return redirectTo(buildReturnUrl("/settings?tab=meta", {
      meta_oauth: "error",
      message: msg,
    }));
  }
});
