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

const API_BASE = "https://graph.facebook.com/v21.0";

async function validateMarketingPermissions(token: string): Promise<string | null> {
  const r = await fetch(`${API_BASE}/me/permissions?access_token=${encodeURIComponent(token)}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return body?.error?.message ?? "Не удалось проверить права Meta-токена";
  const granted = new Set(
    ((body?.data ?? []) as Array<{ permission?: string; status?: string }>)
      .filter((p) => p.status === "granted")
      .map((p) => p.permission),
  );
  if (granted.has("ads_read") || granted.has("ads_management")) return null;
  return "Токен активный, но без прав ads_read / ads_management.";
}

async function fetchMe(token: string): Promise<{ id: string; name: string } | { error: string }> {
  const r = await fetch(`${API_BASE}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  const me = await r.json().catch(() => ({}));
  if (!r.ok) return { error: me?.error?.message ?? "Невалидный токен" };
  return { id: String(me.id), name: String(me.name ?? me.id) };
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

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const method = req.method;

    if (method === "GET") {
      const { data: rows, error: e } = await admin
        .from("meta_tokens")
        .select("id, label, fb_user_id, fb_user_name, created_at")
        .order("created_at", { ascending: true });
      if (e) return json({ error: e.message }, 500);
      return json({ ok: true, tokens: rows ?? [] });
    }

    if (method === "POST") {
      const body = await req.json().catch(() => ({}));
      const token = typeof body.token === "string" ? body.token.trim() : "";
      const label = typeof body.label === "string" && body.label.trim()
        ? body.label.trim().slice(0, 80)
        : "Meta аккаунт";
      if (!token) return json({ error: "Token обязателен" }, 400);

      const me = await fetchMe(token);
      if ("error" in me) return json({ error: me.error }, 400);

      const permErr = await validateMarketingPermissions(token);
      if (permErr) return json({ error: permErr }, 400);

      const { data: inserted, error: insErr } = await admin
        .from("meta_tokens")
        .insert({
          label,
          access_token: token,
          fb_user_id: me.id,
          fb_user_name: me.name,
          created_by: user.id,
        })
        .select("id, label, fb_user_id, fb_user_name, created_at")
        .single();
      if (insErr) return json({ error: insErr.message }, 500);

      // Поддерживаем обратную совместимость: дублируем последний токен в automation_settings,
      // чтобы старые места, читающие meta_access_token, продолжали работать.
      await admin
        .from("automation_settings")
        .upsert({ id: true, meta_access_token: token }, { onConflict: "id" });

      return json({ ok: true, token: inserted });
    }

    if (method === "DELETE") {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id обязателен" }, 400);

      const { error: delErr } = await admin
        .from("meta_tokens")
        .delete()
        .eq("id", id);
      if (delErr) return json({ error: delErr.message }, 500);

      // Если удалили последний — чистим легаси-поле.
      const { count } = await admin
        .from("meta_tokens")
        .select("id", { count: "exact", head: true });
      if (!count) {
        await admin
          .from("automation_settings")
          .upsert({ id: true, meta_access_token: null }, { onConflict: "id" });
      } else {
        // Иначе обновим legacy на самый старый оставшийся.
        const { data: rest } = await admin
          .from("meta_tokens")
          .select("access_token")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (rest?.access_token) {
          await admin
            .from("automation_settings")
            .upsert({ id: true, meta_access_token: rest.access_token }, { onConflict: "id" });
        }
      }

      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
