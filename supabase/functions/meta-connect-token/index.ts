import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function validateMarketingPermissions(apiBase: string, token: string): Promise<string | null> {
  const r = await fetch(`${apiBase}/me/permissions?access_token=${encodeURIComponent(token)}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return body?.error?.message ?? "Не удалось проверить права Meta-токена";

  const granted = new Set(
    ((body?.data ?? []) as Array<{ permission?: string; status?: string }>)
      .filter((p) => p.status === "granted")
      .map((p) => p.permission),
  );
  if (granted.has("ads_read") || granted.has("ads_management")) return null;
  return "Токен активный, но без доступа к рекламным кабинетам. Нужны права ads_read или ads_management у владельца Ad Account.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // admin check
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const method = req.method;
    const apiBase = "https://graph.facebook.com/v21.0";

    if (method === "GET") {
      const { data: s } = await admin
        .from("automation_settings")
        .select("meta_access_token")
        .eq("id", true)
        .maybeSingle();
      const token = s?.meta_access_token;
      if (!token) return json({ ok: true, connected: false });
      const r = await fetch(`${apiBase}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
      const me = await r.json();
      if (!r.ok) return json({ ok: true, connected: false, error: me?.error?.message ?? "Token invalid" });
      const permissionError = await validateMarketingPermissions(apiBase, token);
      if (permissionError) return json({ ok: true, connected: false, account: me, error: permissionError });
      return json({ ok: true, connected: true, account: me });
    }

    if (method === "POST") {
      const body = await req.json().catch(() => ({}));
      const token = typeof body.token === "string" ? body.token.trim() : "";
      if (!token) return json({ error: "Token обязателен" }, 400);

      // verify token
      const r = await fetch(`${apiBase}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
      const me = await r.json();
      if (!r.ok) {
        return json({ error: me?.error?.message ?? "Невалидный токен" }, 400);
      }
      const permissionError = await validateMarketingPermissions(apiBase, token);
      if (permissionError) return json({ error: permissionError }, 400);

      const { error: upErr } = await admin
        .from("automation_settings")
        .upsert({ id: true, meta_access_token: token }, { onConflict: "id" });
      if (upErr) return json({ error: upErr.message }, 500);

      return json({ ok: true, connected: true, account: me });
    }

    if (method === "DELETE") {
      const { error: upErr } = await admin
        .from("automation_settings")
        .upsert({ id: true, meta_access_token: null }, { onConflict: "id" });
      if (upErr) return json({ error: upErr.message }, 500);
      return json({ ok: true, connected: false });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});