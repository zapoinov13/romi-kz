import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const META_API = "https://graph.facebook.com/v21.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getAnonKey(): string {
  return (
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    ""
  );
}

function isMissingTableError(message: string): boolean {
  return /relation.*does not exist|meta_tokens/i.test(message);
}

async function fetchMe(
  token: string,
): Promise<{ id: string; name: string } | { error: string }> {
  const r = await fetch(`${META_API}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  const me = await r.json().catch(() => ({}));
  if (!r.ok) return { error: me?.error?.message ?? "Невалидный токен" };
  return { id: String(me.id), name: String(me.name ?? me.id) };
}

async function validateMarketingPermissions(token: string): Promise<string | null> {
  const r = await fetch(`${META_API}/me/permissions?access_token=${encodeURIComponent(token)}`);
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

async function userHasRole(
  admin: SupabaseClient,
  userId: string,
  role: string,
): Promise<boolean> {
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  return !!data;
}

async function resolveUser(authHeader: string) {
  const anonKey = getAnonKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!anonKey || !supabaseUrl) {
    return { error: "Server misconfigured: missing SUPABASE_URL or ANON key" as const };
  }

  const jwt = authHeader.replace("Bearer ", "").trim();
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const { data, error } = await userClient.auth.getClaims(jwt);
    const sub = data?.claims?.sub;
    if (error || !sub) return { error: "Unauthorized" as const };
    return { user: { id: String(sub) } };
  } catch {
    return { error: "Unauthorized" as const };
  }
}

const TOKEN_LIST_COLUMNS =
  "id, label, fb_user_id, fb_user_name, created_at, created_by, updated_at, source, token_expires_at, scopes";

async function listTokens(
  admin: SupabaseClient,
  userId: string,
  isAdmin: boolean,
) {
  let q = admin
    .from("meta_tokens")
    .select(TOKEN_LIST_COLUMNS)
    .order("created_at", { ascending: true });
  if (!isAdmin) q = q.eq("created_by", userId);

  const { data: rows, error: e } = await q;
  if (e) {
    if (isMissingTableError(e.message)) {
      return {
        tokens: [] as unknown[],
        warning: "Таблица meta_tokens не найдена. Выполните scripts/lovable-meta-oauth-setup.sql",
      };
    }
    // Fallback if OAuth columns not migrated yet on this project.
    if (/column/i.test(e.message)) {
      let q2 = admin
        .from("meta_tokens")
        .select("id, label, fb_user_id, fb_user_name, created_at, created_by, updated_at")
        .order("created_at", { ascending: true });
      if (!isAdmin) q2 = q2.eq("created_by", userId);
      const { data: rows2, error: e2 } = await q2;
      if (e2) {
        if (isMissingTableError(e2.message)) {
          return { tokens: [] as unknown[], warning: "Таблица meta_tokens не найдена" };
        }
        return { error: e2.message };
      }
      return { tokens: rows2 ?? [] };
    }
    return { error: e.message };
  }
  return { tokens: rows ?? [] };
}

async function syncLegacyMetaToken(
  admin: SupabaseClient,
  token: string | null,
) {
  const { error } = await admin
    .from("automation_settings")
    .upsert({ id: true, meta_access_token: token }, { onConflict: "id" });
  if (error) console.warn("automation_settings legacy sync:", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const method = req.method;
    const body = method === "POST"
      ? await req.json().catch(() => ({} as Record<string, unknown>))
      : ({} as Record<string, unknown>);
    const action = typeof body.action === "string" ? body.action : "";

    if (url.searchParams.get("ping") === "1" || action === "ping") {
      return json({
        ok: true,
        service: "meta-connect-token",
        has_url: !!Deno.env.get("SUPABASE_URL"),
        has_service_role: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
        has_anon: !!getAnonKey(),
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    if (!serviceKey || !supabaseUrl) {
      return json({ error: "Server misconfigured: missing Supabase env" }, 500);
    }

    const resolved = await resolveUser(authHeader);
    if ("error" in resolved) return json({ error: resolved.error }, 401);
    const user = resolved.user;

    const admin = createClient(supabaseUrl, serviceKey);
    const isAdmin = await userHasRole(admin, user.id, "admin");

    if (method === "GET" || action === "list") {
      const listed = await listTokens(admin, user.id, isAdmin);
      if ("error" in listed) return json({ error: listed.error }, 500);
      return json({
        ok: true,
        tokens: listed.tokens,
        ...(listed.warning ? { warning: listed.warning } : {}),
      });
    }

    if (method === "POST" && action !== "list" && action !== "delete") {
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
      if (insErr) {
        if (isMissingTableError(insErr.message)) {
          return json({
            error: "Таблица meta_tokens не найдена. Выполните scripts/lovable-meta-oauth-setup.sql в SQL Editor.",
          }, 500);
        }
        return json({ error: insErr.message }, 500);
      }

      await syncLegacyMetaToken(admin, token);

      return json({ ok: true, token: inserted });
    }

    if (method === "DELETE" || action === "delete") {
      const id = url.searchParams.get("id")
        ?? (typeof body.id === "string" ? body.id : "");
      if (!id) return json({ error: "id обязателен" }, 400);

      let delQ = admin.from("meta_tokens").delete().eq("id", id);
      if (!isAdmin) delQ = delQ.eq("created_by", user.id);
      const { error: delErr } = await delQ;
      if (delErr) return json({ error: delErr.message }, 500);

      const { count } = await admin
        .from("meta_tokens")
        .select("id", { count: "exact", head: true });
      if (!count) {
        await syncLegacyMetaToken(admin, null);
      } else {
        const { data: rest } = await admin
          .from("meta_tokens")
          .select("access_token")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        await syncLegacyMetaToken(admin, rest?.access_token ?? null);
      }

      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("meta-connect-token:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
