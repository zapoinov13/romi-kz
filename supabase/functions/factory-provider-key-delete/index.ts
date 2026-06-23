// redeploy: 2026-06-20
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { AUTH_CORS_HEADERS, requireUser, requireProjectAccess } from "../_lib/auth.ts";

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
  const provider = body?.provider as string;
  if (!projectId || !provider) return json({ error: "missing fields" }, 400);
  const acc = await requireProjectAccess(auth.authHeader, projectId);
  if (!acc.ok) return acc.response;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  await admin.from("content_factory_provider_keys")
    .delete().eq("project_id", projectId).eq("provider", provider);
  return json({ ok: true });
});