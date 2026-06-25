// Сохраняет/обновляет Telegram-бота для УПРАВЛЕНИЯ РЕКЛАМОЙ.
// 1. Валидирует токен через getMe.
// 2. UPSERT записи в project_ads_telegram_bots (через service role — bot_token защищён column-level REVOKE).
// 3. Регистрирует webhook в Telegram, чтобы апдейты шли в ads-telegram-webhook.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { AUTH_CORS_HEADERS, requireUser, requireProjectAccess } from "../_lib/auth.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...AUTH_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: AUTH_CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  type Body = {
    project_id?: string;
    bot_token?: string;
    chat_id?: string;
    chat_title?: string;
    allowed_chat_ids?: string[];
    default_cabinet_id?: string | null;
    default_destination?: string;
    default_goal?: string | null;
    default_daily_budget?: number | null;
    default_country?: string | null;
    default_city?: string | null;
    default_geo?: string[];
    default_age_min?: number | null;
    default_age_max?: number | null;
    default_gender?: string | null;
    default_objective?: string | null;
    cabinets?: Array<{ cabinet_id: string; alias: string; is_default?: boolean }>;
  };
  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const projectId = body.project_id?.trim();
  const botToken = body.bot_token?.trim();
  const chatId = body.chat_id?.trim();
  if (!projectId || !chatId) return json({ error: "project_id и chat_id обязательны" }, 400);
  if (botToken && !/^\d+:[A-Za-z0-9_-]{30,}$/.test(botToken)) {
    return json({ error: "Похоже, токен бота некорректный. Формат: 123456:AA..." }, 400);
  }

  const access = await requireProjectAccess(auth.authHeader, projectId);
  if (!access.ok) return access.response;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let effectiveToken = botToken;
  let username: string | null = null;
  if (!effectiveToken) {
    const { data: existing, error: exErr } = await admin
      .from("project_ads_telegram_bots")
      .select("bot_token, bot_username")
      .eq("project_id", projectId)
      .maybeSingle();
    if (exErr) return json({ error: exErr.message }, 500);
    if (!existing?.bot_token) {
      return json({ error: "Введите токен бота — он ещё не сохранён для этого проекта." }, 400);
    }
    effectiveToken = existing.bot_token as string;
    username = (existing.bot_username as string) ?? null;
  }

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

  // Регистрируем webhook (URL — сама эта же функция, только -webhook).
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const webhookUrl = `${supabaseUrl}/functions/v1/ads-telegram-webhook`;
  const secret = await sha256Base64Url(`ads-telegram-webhook:${effectiveToken}`);
  try {
    const setRes = await fetch(`https://api.telegram.org/bot${effectiveToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["message", "edited_message", "callback_query"],
        drop_pending_updates: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const setJson = await setRes.json();
    if (!setRes.ok || !setJson.ok) {
      return json({ error: `setWebhook: ${setJson.description ?? setRes.status}` }, 502);
    }
  } catch (e) {
    return json({ error: `setWebhook error: ${(e as Error).message}` }, 502);
  }

  const allowed = Array.isArray(body.allowed_chat_ids) && body.allowed_chat_ids.length
    ? Array.from(new Set([chatId, ...body.allowed_chat_ids.map((s) => String(s).trim()).filter(Boolean)]))
    : [chatId];

  const { error } = await admin
    .from("project_ads_telegram_bots")
    .upsert(
      {
        project_id: projectId,
        bot_token: effectiveToken,
        bot_username: username,
        chat_id: chatId,
        chat_title: body.chat_title ?? null,
        allowed_chat_ids: allowed,
        default_cabinet_id: body.default_cabinet_id ?? null,
        default_destination: body.default_destination ?? "whatsapp",
        default_goal: body.default_goal ?? null,
        default_daily_budget: body.default_daily_budget ?? null,
        default_country: body.default_country ?? "KZ",
        default_city: body.default_city ?? null,
        default_geo: Array.isArray(body.default_geo) ? body.default_geo : [],
        default_age_min: body.default_age_min ?? null,
        default_age_max: body.default_age_max ?? null,
        default_gender: body.default_gender ?? "all",
        default_objective: body.default_objective ?? null,
        is_active: true,
        created_by: auth.userId,
      },
      { onConflict: "project_id" },
    );

  if (error) return json({ error: error.message }, 500);

  // Sync allowed cabinets list
  const { data: botRow } = await admin
    .from("project_ads_telegram_bots")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle();
  const botId = botRow?.id as string | undefined;
  if (botId && Array.isArray(body.cabinets)) {
    const clean = body.cabinets
      .filter((c) => c?.cabinet_id && c?.alias?.trim())
      .map((c) => ({
        bot_id: botId,
        project_id: projectId,
        cabinet_id: c.cabinet_id,
        alias: c.alias.trim().toLowerCase(),
        is_default: !!c.is_default,
      }));
    // Replace full set
    await admin.from("ads_telegram_bot_cabinets").delete().eq("bot_id", botId);
    if (clean.length) {
      const { error: insErr } = await admin.from("ads_telegram_bot_cabinets").insert(clean);
      if (insErr) return json({ error: `cabinets: ${insErr.message}` }, 500);
    }
  }

  return json({ ok: true, bot_username: username });
});