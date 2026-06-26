import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { userHasRole } from "../_lib/auth.ts";
import { fetchMe, validateMarketingPermissions } from "../_lib/meta_connect_helpers.ts";

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

    const isAdmin = await userHasRole(user.id, "admin");
    const method = req.method;

    if (method === "GET") {
      let q = admin
        .from("meta_tokens")
        .select("id, label, fb_user_id, fb_user_name, created_at, source, token_expires_at")
        .order("created_at", { ascending: true });
      if (!isAdmin) q = q.eq("created_by", user.id);
      const { data: rows, error: e } = await q;
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

      const { data: existing } = await admin
        .from("meta_tokens")
        .select("id")
        .eq("created_by", user.id)
        .eq("fb_user_id", me.id)
        .maybeSingle();

      const row = {
        label,
        access_token: token,
        fb_user_id: me.id,
        fb_user_name: me.name,
        created_by: user.id,
        source: "manual",
      };

      const { data: inserted, error: insErr } = existing?.id
        ? await admin
          .from("meta_tokens")
          .update(row)
          .eq("id", existing.id)
          .select("id, label, fb_user_id, fb_user_name, created_at, source")
          .single()
        : await admin
          .from("meta_tokens")
          .insert(row)
          .select("id, label, fb_user_id, fb_user_name, created_at, source")
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

      let delQ = admin.from("meta_tokens").delete().eq("id", id);
      if (!isAdmin) delQ = delQ.eq("created_by", user.id);
      const { error: delErr } = await delQ;
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
