import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { requireProjectAccess, requireUser } from "../_lib/auth.ts";
import {
  buildFacebookOAuthUrl,
  getMetaAppId,
} from "../_lib/meta_connect_helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const appId = getMetaAppId();
    if (!appId) {
      return json({ error: "META_APP_ID не настроен на сервере" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const returnTo = typeof body.return_to === "string" && body.return_to.startsWith("/")
      ? body.return_to.slice(0, 500)
      : "/settings?tab=meta";
    const projectId = typeof body.project_id === "string" ? body.project_id : null;
    const label = typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 80)
      : null;

    if (projectId) {
      const access = await requireProjectAccess(auth.authHeader, projectId);
      if (!access.ok) return access.response;
    }

    const state = randomState();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: insErr } = await admin.from("meta_oauth_states").insert({
      state,
      user_id: auth.userId,
      return_to: returnTo,
      project_id: projectId,
      label,
      expires_at: expiresAt,
    });
    if (insErr) return json({ error: insErr.message }, 500);

    return json({ ok: true, url: buildFacebookOAuthUrl(state) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
