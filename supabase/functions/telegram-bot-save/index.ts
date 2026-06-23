// Сохраняет/обновляет Telegram-бота для проекта.
// Валидирует токен через getMe, потом UPSERT через service_role
// (чтобы обойти column-level REVOKE на bot_token).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { AUTH_CORS_HEADERS, requireUser, requireProjectAccess } from "../_lib/auth.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...AUTH_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: AUTH_CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: { project_id?: string; bot_token?: string; chat_id?: string; chat_title?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const projectId = body.project_id?.trim();
  const botToken = body.bot_token?.trim();
  const chatId = body.chat_id?.trim();
  if (!projectId || !chatId) {
    return json({ error: "project_id и chat_id обязательны" }, 400);
  }
  if (botToken && !/^\d+:[A-Za-z0-9_-]{30,}$/.test(botToken)) {
    return json({ error: "Похоже, токен бота некорректный. Формат: 123456:AA..." }, 400);
  }

  const access = await requireProjectAccess(auth.authHeader, projectId);
  if (!access.ok) return access.response;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Если токен не передан — берём существующий из БД (режим «обновить chat_id»).
  let effectiveToken = botToken;
  let username: string | null = null;
  if (!effectiveToken) {
    const { data: existing, error: exErr } = await admin
      .from("project_telegram_bots")
      .select("bot_token, bot_username")
      .eq("project_id", projectId)
      .maybeSingle();
    if (exErr) return json({ error: exErr.message }, 500);
    if (!existing?.bot_token) {
      return json({ error: "Введите токен бота — он ещё не сохранён для этого проекта." }, 400);
    }
    effectiveToken = existing.bot_token;
    username = existing.bot_username ?? null;
  }

  // Валидируем токен через getMe (только если он был передан заново).
  if (botToken) {
    try {
      const me = await fetch(`https://api.telegram.org/bot${effectiveToken}/getMe`, {
        signal: AbortSignal.timeout(10_000),
      });
      const meJson = await me.json();
      if (!me.ok || !meJson.ok) {
        return json({ error: `Telegram отверг токен: ${meJson.description ?? me.status}` }, 400);
      }
      username = meJson.result?.username ?? null;
    } catch (e) {
      return json({ error: `Не удалось связаться с Telegram: ${(e as Error).message}` }, 502);
    }
  }

  const { error } = await admin
    .from("project_telegram_bots")
    .upsert(
      {
        project_id: projectId,
        bot_token: effectiveToken,
        bot_username: username,
        chat_id: chatId,
        chat_title: body.chat_title ?? null,
        is_active: true,
        created_by: auth.userId,
        last_test_at: null,
        last_test_ok: null,
        last_test_error: null,
      },
      { onConflict: "project_id" },
    );

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, bot_username: username });
});