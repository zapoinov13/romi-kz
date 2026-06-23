// redeploy: 2026-06-20
// Re-validates an already-stored provider key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { AUTH_CORS_HEADERS, requireUser, requireProjectAccess } from "../_lib/auth.ts";
import { decryptApiKey } from "../_lib/cf-crypto.ts";
import { adapters, ProviderError, type ProviderId } from "../_lib/cf-providers.ts";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...AUTH_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: AUTH_CORS_HEADERS });
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const projectId = body?.project_id as string;
  const provider = body?.provider as ProviderId;
  if (!projectId || !provider) return json({ error: "missing fields" }, 400);
  const acc = await requireProjectAccess(auth.authHeader, projectId);
  if (!acc.ok) return acc.response;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin
    .from("content_factory_provider_keys")
    .select("api_key_encrypted")
    .eq("project_id", projectId).eq("provider", provider).maybeSingle();
  if (error || !data) return json({ error: "key not found" }, 404);

  let plain: string;
  try { plain = await decryptApiKey(data.api_key_encrypted); }
  catch { return json({ error: "decrypt failed" }, 500); }

  let status: "ok" | "error" | "quota" = "ok";
  let last_error: string | null = null;
  let balance_info: unknown = null;
  try {
    const r = await adapters[provider].validate(plain);
    balance_info = (r as any)?.balance ?? null;
  } catch (e) {
    if (e instanceof ProviderError) {
      status = e.kind === "quota" ? "quota" : "error";
      last_error = e.message;
    } else {
      status = "error";
      last_error = String((e as Error).message || e);
    }
  }
  await admin.from("content_factory_provider_keys").update({
    status, last_error, balance_info, last_checked_at: new Date().toISOString(),
  }).eq("project_id", projectId).eq("provider", provider);

  return json({ ok: status === "ok", status, error: last_error, balance: balance_info });
});