// Save (insert/update) a per-project provider API key for Content Factory.
// Body: { project_id, provider, api_key, priority?, is_enabled? }
// Validates the key with the provider before storing.
// redeploy: 2026-06-20

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { AUTH_CORS_HEADERS, requireUser, requireProjectAccess } from "../_lib/auth.ts";
import { encryptApiKey, maskKey } from "../_lib/cf-crypto.ts";
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

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const projectId = body?.project_id as string;
  const provider = body?.provider as ProviderId;
  const apiKey = (body?.api_key as string || "").trim();
  const priority = Number.isFinite(body?.priority) ? Number(body.priority) : 100;
  const isEnabled = body?.is_enabled !== false;

  if (!projectId || !provider || !apiKey) return json({ error: "missing fields" }, 400);
  if (!["kie_ai", "gemini", "openai"].includes(provider)) return json({ error: "bad provider" }, 400);

  const acc = await requireProjectAccess(auth.authHeader, projectId);
  if (!acc.ok) return acc.response;

  let status: "ok" | "error" | "quota" = "ok";
  let last_error: string | null = null;
  let balance_info: unknown = null;
  try {
    const r = await adapters[provider].validate(apiKey);
    balance_info = (r as any)?.balance ?? null;
  } catch (e) {
    if (e instanceof ProviderError) {
      status = e.kind === "quota" ? "quota" : "error";
      last_error = e.message;
    } else {
      status = "error";
      last_error = String((e as Error).message || e);
    }
    return json({ ok: false, status, error: last_error }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const enc = await encryptApiKey(apiKey);
  const { error } = await admin.from("content_factory_provider_keys").upsert({
    project_id: projectId,
    provider,
    api_key_encrypted: enc,
    key_hint: maskKey(apiKey),
    priority,
    is_enabled: isEnabled,
    status,
    last_checked_at: new Date().toISOString(),
    last_error,
    balance_info,
    created_by: auth.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id,provider" });
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, status, key_hint: maskKey(apiKey) });
});