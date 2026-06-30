// Webhook для бота управления рекламой.
// 1. Валидирует X-Telegram-Bot-Api-Secret-Token (SHA256 от "ads-telegram-webhook:" + bot_token).
// 2. Проверяет, что chat_id входит в allowed_chat_ids.
// 3. Скачивает прикреплённое медиа (если есть) и кладёт в storage bucket `ads-telegram-media`.
// 4. Парсит команду из текста/подписи.
// 5. Пишет запись в ads_telegram_commands и отвечает в чат.
//
// v1: само создание кампании не запускается отсюда (пайплайн запуска требует
// много обязательных полей — pageId, accessToken и т.п.). Команда сохраняется
// со статусом `received`, оператор может запустить её одним кликом на сайте.
// Когда подтвердим UX — добавим прямой вызов launch-campaign со стандартным набором.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEqual(a: string | null, b: string): boolean {
  if (!a) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const CABINET_META_SELECT =
  "id, name, external_id, ad_account_id, page_id, page_name, instagram_id, access_token, whatsapp_number, pixel_id, pixel_event, website_url, business_id, app_id, currency, lead_form_id";

type CabinetMetaRow = {
  id: string;
  name: string | null;
  external_id: string | null;
  ad_account_id: string | null;
  page_id: string | null;
  page_name: string | null;
  instagram_id: string | null;
  access_token: string | null;
  whatsapp_number: string | null;
  pixel_id: string | null;
  pixel_event: string | null;
  website_url: string | null;
  business_id: string | null;
  app_id: string | null;
  currency: string | null;
  lead_form_id: string | null;
};

function resolveAdAccountId(cab: CabinetMetaRow | null | undefined): string {
  const fromCol = String(cab?.ad_account_id ?? "").trim();
  const fromExt = String(cab?.external_id ?? "").trim();
  return fromCol || fromExt;
}

function cabinetLaunchMissingFields(
  cab: CabinetMetaRow | null | undefined,
  destination: string,
): string[] {
  const missing: string[] = [];
  if (!cab) return ["кабинет не найден"];
  if (!resolveAdAccountId(cab)) missing.push("ad_account_id (ID рекламного аккаунта act_…)");
  if (!String(cab.page_id ?? "").trim()) missing.push("page_id (Facebook-страница)");
  if (destination === "whatsapp") {
    const digits = String(cab.whatsapp_number ?? "").replace(/\D/g, "");
    if (digits.length < 10) missing.push("whatsapp_number");
  }
  if (destination === "site" && !String(cab.pixel_id ?? "").trim()) {
    missing.push("pixel_id");
  }
  return missing;
}

function cabinetFieldsErrorText(cabName: string, missing: string[]): string {
  return (
    `⚠️ У кабинета <b>${cabName}</b> не заполнены обязательные поля:\n` +
    missing.map((f) => `• ${f}`).join("\n") +
    "\n\nОткрой <b>Реклама → карточка кабинета</b> и заполни настройки Meta."
  );
}

function clientConfigFromCabinet(cab: CabinetMetaRow, metaToken: string, budget: number | null) {
  const adAccountId = resolveAdAccountId(cab);
  return {
    client_name: cab.name,
    ad_account_id: adAccountId,
    page_id: cab.page_id,
    page_name: cab.page_name,
    instagram_actor_id: cab.instagram_id,
    fb_pixel_id: cab.pixel_id,
    pixel_event: cab.pixel_event ?? "Lead",
    website_url: cab.website_url,
    whatsapp_number: cab.whatsapp_number,
    business_id: cab.business_id,
    app_id: cab.app_id,
    currency: cab.currency,
    lead_form_id: cab.lead_form_id ?? null,
    access_token: metaToken,
    daily_budget: budget ? Math.round(Number(budget) * 100) : undefined,
  };
}

type Destination = "whatsapp" | "instagram" | "messenger" | "site" | "traffic" | null;

type Action = "launch" | "status" | "help" | "cabinets" | "defaults" | null;

interface Overrides {
  budget?: number;
  geo?: string[];
  age_min?: number;
  age_max?: number;
  gender?: string;
}

function parseCommand(raw: string): {
  action: Action;
  destination: Destination;
  alias: string | null;
  overrides: Overrides;
} {
  const original = (raw || "").trim();
  if (!original) return { action: null, destination: null, alias: null, overrides: {} };
  const lower = original.toLowerCase();

  if (/^\/?(help|помощь|команды)\b/.test(lower)) return { action: "help", destination: null, alias: null, overrides: {} };
  if (/^\/?(status|статус)\b/.test(lower)) return { action: "status", destination: null, alias: null, overrides: {} };
  if (/^\/?(cabinets|кабинеты)\b/.test(lower)) return { action: "cabinets", destination: null, alias: null, overrides: {} };
  if (/^\/?(defaults|дефолты|настройки)\b/.test(lower)) return { action: "defaults", destination: null, alias: null, overrides: {} };

  const launchRe = /^(\/launch|запусти|launch|старт|start)\b/;
  if (!launchRe.test(lower)) return { action: null, destination: null, alias: null, overrides: {} };

  // Extract destination
  let dest: Destination = null;
  if (/(whatsapp|вотсап|ватсап|вацап|\bwa\b)/.test(lower)) dest = "whatsapp";
  else if (/(instagram|инстаграм|\bинст\b|\big\b)/.test(lower)) dest = "instagram";
  else if (/(messenger|мессенджер|messanger)/.test(lower)) dest = "messenger";
  else if (/(site|сайт|website|landing|лендинг)/.test(lower)) dest = "site";
  else if (/(traffic|трафик)/.test(lower)) dest = "traffic";

  // Tokens after the launch keyword. First non-keyword non-key=val token = alias.
  const stripped = original.replace(launchRe, "").trim();
  const tokens = stripped.split(/\s+/).filter(Boolean);
  const DEST_WORDS = new Set([
    "whatsapp","вотсап","ватсап","вацап","wa",
    "instagram","инстаграм","инст","ig",
    "messenger","мессенджер","messanger",
    "site","сайт","website","landing","лендинг",
    "traffic","трафик",
  ]);
  let alias: string | null = null;
  const overrides: Overrides = {};
  for (const tok of tokens) {
    if (tok.includes("=")) {
      const [k, vRaw] = tok.split("=", 2);
      const key = k.toLowerCase();
      const v = vRaw?.trim();
      if (!v) continue;
      if (key === "budget" || key === "бюджет") overrides.budget = Number(v.replace(/[^\d.]/g, "")) || undefined;
      else if (key === "geo" || key === "гео") overrides.geo = v.split(",").map((s) => s.trim()).filter(Boolean);
      else if (key === "age" || key === "возраст") {
        const m = v.match(/(\d+)\s*[-–]\s*(\d+)/);
        if (m) { overrides.age_min = Number(m[1]); overrides.age_max = Number(m[2]); }
      } else if (key === "gender" || key === "пол") {
        const g = v.toLowerCase();
        if (g.startsWith("м") || g === "male" || g === "m") overrides.gender = "male";
        else if (g.startsWith("ж") || g === "female" || g === "f") overrides.gender = "female";
        else overrides.gender = "all";
      }
      continue;
    }
    const low = tok.toLowerCase();
    if (DEST_WORDS.has(low)) continue;
    if (alias === null) alias = low;
  }

  return { action: "launch", destination: dest, alias, overrides };
}

async function sendMessage(token: string, chatId: string, text: string, replyTo?: number) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: replyTo,
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const j = await res.json();
    return j?.result?.message_id ?? null;
  } catch {
    return null;
  }
}

async function downloadAndStoreMedia(
  admin: ReturnType<typeof createClient>,
  botToken: string,
  fileId: string,
  projectId: string,
): Promise<{ path: string; contentType: string } | null> {
  try {
    const metaRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    const meta = await metaRes.json();
    if (!metaRes.ok || !meta.ok) return null;
    const filePath = meta.result?.file_path as string | undefined;
    if (!filePath) return null;
    const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!fileRes.ok) return null;
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "bin";
    const contentType =
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
      ext === "png" ? "image/png" :
      ext === "webp" ? "image/webp" :
      ext === "mp4" ? "video/mp4" :
      ext === "mov" ? "video/quicktime" :
      "application/octet-stream";
    const key = `${projectId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage.from("ads-telegram-media").upload(key, bytes, {
      contentType,
      upsert: false,
    });
    if (error) {
      console.error("[ads-telegram-webhook] storage upload:", error.message);
      return null;
    }
    return { path: key, contentType };
  } catch (e) {
    console.error("[ads-telegram-webhook] download:", (e as Error).message);
    return null;
  }
}

const HELP_TEXT =
  "<b>Команды:</b>\n" +
  "• <code>/launch [кабинет] whatsapp</code> — запустить рекламу на WhatsApp\n" +
  "   (также: instagram / messenger / site / traffic)\n" +
  "• Без кабинета — берётся кабинет по умолчанию\n" +
  "• Параметры через пробел: <code>budget=5000 geo=Алматы,Астана age=25-45 gender=ж</code>\n" +
  "• <code>/cabinets</code> — список доступных кабинетов\n" +
  "• <code>/defaults</code> — текущие дефолты\n" +
  "• <code>/status</code> — последние запуски\n" +
  "• <code>/help</code> — эта справка\n\n" +
  "<b>Буст IG-публикации:</b>\n" +
  "Пришли ссылку на пост/reels/карусель из Instagram + цель, например:\n" +
  "<code>https://www.instagram.com/p/CxYz123/ запусти на whatsapp</code>\n" +
  "Бот найдёт пост в подключённом IG-аккаунте и предложит подтвердить запуск.\n\n" +
  "Русские синонимы: <code>запусти</code>, <code>статус</code>, <code>помощь</code>, <code>кабинеты</code>, <code>дефолты</code>.";

const IG_URL_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:[^/\s?]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;

function extractIgShortcode(text: string): { shortcode: string; permalink: string } | null {
  const m = text.match(IG_URL_RE);
  if (!m) return null;
  const shortcode = m[1];
  return { shortcode, permalink: `https://www.instagram.com/p/${shortcode}/` };
}

async function resolveIgMedia(
  igUserId: string,
  shortcode: string,
  accessToken: string,
): Promise<{ id: string; caption: string | null; media_type: string | null; permalink: string | null } | null> {
  let url: string | null =
    `https://graph.facebook.com/v21.0/${igUserId}/media?fields=id,shortcode,caption,media_type,permalink&limit=100&access_token=${encodeURIComponent(accessToken)}`;
  for (let page = 0; page < 5 && url; page++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const j = await res.json().catch(() => ({})) as {
        data?: Array<{ id: string; shortcode?: string; caption?: string; media_type?: string; permalink?: string }>;
        paging?: { next?: string };
        error?: { message?: string };
      };
      if (!res.ok || j.error) {
        console.error("[ads-telegram-webhook] IG media list err:", j.error?.message);
        return null;
      }
      const hit = (j.data ?? []).find((m) => m.shortcode === shortcode);
      if (hit) {
        return {
          id: hit.id,
          caption: hit.caption ?? null,
          media_type: hit.media_type ?? null,
          permalink: hit.permalink ?? null,
        };
      }
      url = j.paging?.next ?? null;
    } catch (e) {
      console.error("[ads-telegram-webhook] IG media list exception:", (e as Error).message);
      return null;
    }
  }
  return null;
}

async function sendMessageWithKeyboard(
  token: string,
  chatId: string,
  text: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>,
  replyTo?: number,
) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: replyTo,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const j = await res.json();
    return j?.result?.message_id ?? null;
  } catch { return null; }
}

async function answerCallbackQuery(token: string, callbackId: string, text?: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackId, text: text ?? "" }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* noop */ }
}

async function editMessageText(token: string, chatId: string, messageId: number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* noop */ }
}

function shortToken(len = 10): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => (b % 36).toString(36)).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let update: any;
  try { update = await req.json(); } catch { return json({ ok: true, ignored: "bad_json" }); }

  const callbackQuery = update.callback_query;
  const message = update.message ?? update.edited_message ?? callbackQuery?.message;
  if (!message?.chat?.id || typeof update.update_id !== "number") {
    return json({ ok: true, ignored: true });
  }
  const chatId = String(message.chat.id);
  // Для callback_query берём текст из изначального триггера (data), а не из reply-сообщения.
  const text: string = callbackQuery ? "" : (message.text ?? message.caption ?? "");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Найти бота по chat_id (быстрый путь). Поскольку chat_id уникален в пределах одного бота
  // и у нас 1 бот = 1 проект, идём по allowed_chat_ids.
  const { data: bots, error: botsErr } = await admin
    .from("project_ads_telegram_bots")
    .select("id, project_id, bot_token, chat_id, allowed_chat_ids, default_cabinet_id, default_destination, default_daily_budget, default_country, default_city, default_geo, default_age_min, default_age_max, default_gender, default_objective, is_active")
    .contains("allowed_chat_ids", [chatId]);
  if (botsErr) {
    console.error("[ads-telegram-webhook] bots query:", botsErr.message);
    return json({ ok: true });
  }
  if (!bots || bots.length === 0) {
    // Возможно chat_id новый — игнорируем тихо.
    return json({ ok: true, ignored: "unknown_chat" });
  }

  // Если нашлось несколько — выбираем тот, чей secret_token совпадает.
  const secretHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  let bot: typeof bots[number] | null = null;
  for (const b of bots) {
    if (!b.bot_token) continue;
    const expected = await sha256Base64Url(`ads-telegram-webhook:${b.bot_token}`);
    if (safeEqual(secretHeader, expected)) {
      bot = b;
      break;
    }
  }
  if (!bot) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  if (!bot.is_active) return json({ ok: true, ignored: "disabled" });

  // ============ CALLBACK_QUERY (подтверждение/отмена буста) ============
  if (callbackQuery) {
    const data: string = callbackQuery.data ?? "";

    // ---- Alert ack / snooze ----
    const alertMatch = data.match(/^(ack|snooze):([0-9a-f-]{36})(?::(\d+))?$/i);
    if (alertMatch) {
      const [, action, alertId, hoursRaw] = alertMatch;
      const patch: Record<string, unknown> = {};
      let toastText = "";
      if (action === "ack") {
        patch.acknowledged_at = new Date().toISOString();
        patch.snoozed_until = null;
        toastText = "✅ Подтверждено";
      } else {
        const hours = Math.max(1, Math.min(72, Number(hoursRaw || "4")));
        patch.snoozed_until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
        toastText = `💤 Отложено на ${hours}ч`;
      }
      await admin.from("ad_alerts").update(patch).eq("id", alertId);
      await answerCallbackQuery(bot.bot_token as string, callbackQuery.id, toastText);
      if (callbackQuery.message?.message_id) {
        const oldText = callbackQuery.message.text ?? callbackQuery.message.caption ?? "";
        await editMessageText(
          bot.bot_token as string,
          chatId,
          callbackQuery.message.message_id,
          `${oldText}\n\n<i>${toastText}</i>`,
        );
      }
      return json({ ok: true });
    }

    const m = data.match(/^(confirm|cancel):(.+)$/);
    if (!m) {
      await answerCallbackQuery(bot.bot_token as string, callbackQuery.id, "Неизвестная команда");
      return json({ ok: true });
    }
    const [, action, token] = m;
    const { data: pending } = await admin
      .from("ads_telegram_commands")
      .select("id, status, boost_payload, project_id, cabinet_id, reply_message_id")
      .eq("confirmation_token", token)
      .maybeSingle();
    if (!pending || pending.status !== "pending_confirmation") {
      await answerCallbackQuery(bot.bot_token as string, callbackQuery.id, "Команда уже обработана");
      return json({ ok: true });
    }

    if (action === "cancel") {
      await admin.from("ads_telegram_commands").update({
        status: "cancelled", cancelled_at: new Date().toISOString(),
      }).eq("id", pending.id);
      await answerCallbackQuery(bot.bot_token as string, callbackQuery.id, "Отменено");
      if (callbackQuery.message?.message_id) {
        await editMessageText(bot.bot_token as string, chatId, callbackQuery.message.message_id, "❌ Запуск отменён.");
      }
      return json({ ok: true });
    }

    // confirm → запускаем launch-campaign
    await answerCallbackQuery(bot.bot_token as string, callbackQuery.id, "Запускаем…");
    if (callbackQuery.message?.message_id) {
      await editMessageText(bot.bot_token as string, chatId, callbackQuery.message.message_id, "🚀 Запускаю кампанию в Meta…");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const launchId = crypto.randomUUID();
    const payload = { ...(pending.boost_payload as Record<string, unknown>), launchId };
    const fd = new FormData();
    fd.append("payload", JSON.stringify(payload));

    // A2: создаём строку в ad_campaigns ДО запуска, чтобы launch-campaign
    // мог апдейтить статусы (он делает UPDATE WHERE launch_id=…).
    const boost = pending.boost_payload as Record<string, unknown>;
    await admin.from("ad_campaigns").insert({
      cabinet_id: pending.cabinet_id,
      project_id: pending.project_id,
      goal: String(boost.goal ?? "whatsapp"),
      budget: boost.budget != null ? String(boost.budget) : null,
      text: String((boost.primaryText as string) ?? ""),
      campaign_name: String(boost.campaignName ?? ""),
      adset_name: String(boost.adsetName ?? ""),
      ad_name: String(boost.adName ?? ""),
      launch_id: launchId,
      status: "queued",
      status_step: "telegram_boost_confirmed",
      status_message: "Запущено из Telegram-бота (IG-boost)",
      created_by: null,
    });

    let launchOk = false;
    let launchErr = "";
    let launchMeta: { metaCampaignId?: string; metaAdId?: string } = {};
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/launch-campaign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        body: fd,
        signal: AbortSignal.timeout(180_000),
      });
      const j = await res.json().catch(() => ({})) as any;
      if (res.ok && j.ok) {
        launchOk = true;
        launchMeta = { metaCampaignId: j.metaCampaignId, metaAdId: j.metaAdId };
      } else {
        launchErr = j.error ?? j.step ?? `HTTP ${res.status}`;
      }
    } catch (e) {
      launchErr = (e as Error).message;
    }

    await admin.from("ads_telegram_commands").update({
      status: launchOk ? "launched" : "failed",
      confirmed_at: new Date().toISOString(),
      launched_at: launchOk ? new Date().toISOString() : null,
      launch_id: launchId,
      error: launchOk ? null : launchErr.slice(0, 500),
    }).eq("id", pending.id);

    const resultText = launchOk
      ? `✅ Запущено!\n• Campaign: <code>${launchMeta.metaCampaignId ?? "?"}</code>\n• Ad: <code>${launchMeta.metaAdId ?? "?"}</code>`
      : `❌ Ошибка запуска: ${launchErr.slice(0, 300)}`;
    await sendMessage(bot.bot_token as string, chatId, resultText);
    return json({ ok: true });
  }
  // ============ /CALLBACK_QUERY ============

  // Дедупликация по update_id
  const fromUser = message.from?.username
    ? `@${message.from.username}`
    : [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") || null;

  const parsed = parseCommand(text);

  // Медиа
  let mediaKind: string | null = null;
  let fileId: string | null = null;
  if (message.photo?.length) {
    mediaKind = "photo";
    fileId = message.photo[message.photo.length - 1].file_id;
  } else if (message.video) {
    mediaKind = "video";
    fileId = message.video.file_id;
  } else if (message.document) {
    mediaKind = "document";
    fileId = message.document.file_id;
  } else if (message.animation) {
    mediaKind = "animation";
    fileId = message.animation.file_id;
  }

  let mediaPath: string | null = null;
  if (fileId) {
    const stored = await downloadAndStoreMedia(admin as any, bot.bot_token as string, fileId, bot.project_id as string);
    if (stored) mediaPath = stored.path;
  }

  // Загружаем кабинеты, доступные боту
  const { data: botCabs } = await admin
    .from("ads_telegram_bot_cabinets")
    .select("cabinet_id, alias, is_default, ad_cabinets:cabinet_id(name)")
    .eq("bot_id", bot.id);
  type CabRow = { cabinet_id: string; alias: string; is_default: boolean; ad_cabinets: { name: string } | null };
  const cabs = (botCabs ?? []) as unknown as CabRow[];
  const findCabinetByAlias = (alias: string | null): CabRow | null => {
    if (alias) {
      const hit = cabs.find((c) => c.alias === alias.toLowerCase());
      if (hit) return hit;
    }
    return cabs.find((c) => c.is_default) ?? null;
  };

  // ===== IG-URL → boost существующей публикации (с подтверждением) =====
  const igHit = extractIgShortcode(text);
  if (igHit) {
    // Цель: из текста; если не указана — берём дефолт бота; если и его нет — whatsapp.
    const destination = parsed.destination
      ?? ((bot.default_destination as string | null)?.toLowerCase() as any)
      ?? "whatsapp";
    const cab = findCabinetByAlias(parsed.alias);
    if (!cab) {
      const msg = parsed.alias
        ? `⚠️ Кабинет <code>${parsed.alias}</code> не найден. Список: <code>/cabinets</code>.`
        : "⚠️ Боту не выдан доступ ни к одному кабинету. Открой Настройки → Telegram для рекламы.";
      await sendMessage(bot.bot_token as string, chatId, msg, message.message_id);
      await admin.from("ads_telegram_commands").upsert({
        project_id: bot.project_id, bot_id: bot.id, chat_id: chatId,
        from_user: fromUser, message_id: message.message_id ?? null,
        update_id: update.update_id, command_text: text,
        parsed_destination: destination, status: "failed",
        ig_shortcode: igHit.shortcode, ig_permalink: igHit.permalink,
        error: "no_cabinet",
      }, { onConflict: "update_id" });
      return json({ ok: true });
    }

    // Загружаем кабинет с IG/Page/token
    const { data: cabRow } = await admin
      .from("ad_cabinets")
      .select(CABINET_META_SELECT)
      .eq("id", cab.cabinet_id)
      .maybeSingle();
    const cabMeta = cabRow as CabinetMetaRow | null;
    const missingIg = cabinetLaunchMissingFields(cabMeta, destination);
    if (missingIg.length > 0) {
      await sendMessage(
        bot.bot_token as string,
        chatId,
        cabinetFieldsErrorText(cab.ad_cabinets?.name ?? cab.alias, missingIg),
        message.message_id,
      );
      return json({ ok: true });
    }
    if (!cabMeta?.instagram_id) {
      await sendMessage(bot.bot_token as string, chatId,
        `⚠️ К кабинету <b>${cab.ad_cabinets?.name ?? cab.alias}</b> не привязан Instagram Business аккаунт. Заполни поле в карточке кабинета.`,
        message.message_id);
      return json({ ok: true });
    }

    // Берём Meta access_token: сначала с кабинета, иначе глобальный.
    let metaToken = (cabMeta.access_token as string | null) ?? "";
    if (!metaToken) {
      const { data: aset } = await admin.from("automation_settings").select("meta_access_token").eq("id", true).maybeSingle();
      metaToken = (aset?.meta_access_token as string | null) ?? "";
    }
    if (!metaToken) {
      await sendMessage(bot.bot_token as string, chatId,
        "⚠️ Не настроен Meta access token. Открой Настройки → Подключить Meta.",
        message.message_id);
      return json({ ok: true });
    }

    // Поиск IG-поста
    const igMedia = await resolveIgMedia(cabMeta.instagram_id as string, igHit.shortcode, metaToken);
    if (!igMedia) {
      await sendMessage(bot.bot_token as string, chatId,
        `❌ Не нашёл пост <code>${igHit.shortcode}</code> в IG-аккаунте кабинета <b>${cab.ad_cabinets?.name ?? cab.alias}</b>. Проверь, что пост опубликован с того же IG-Business аккаунта.`,
        message.message_id);
      await admin.from("ads_telegram_commands").upsert({
        project_id: bot.project_id, bot_id: bot.id, chat_id: chatId, cabinet_id: cab.cabinet_id, alias_used: cab.alias,
        from_user: fromUser, message_id: message.message_id ?? null,
        update_id: update.update_id, command_text: text,
        parsed_destination: destination, status: "failed",
        ig_shortcode: igHit.shortcode, ig_permalink: igHit.permalink,
        error: "ig_post_not_found",
      }, { onConflict: "update_id" });
      return json({ ok: true });
    }

    // Резолвим параметры таргетинга (override > bot defaults)
    const geo = parsed.overrides.geo?.length
      ? parsed.overrides.geo
      : ((bot.default_geo as string[] | null)?.length
          ? (bot.default_geo as string[])
          : [bot.default_city, bot.default_country].filter(Boolean) as string[]);
    const ageMin = parsed.overrides.age_min ?? (bot.default_age_min as number | null) ?? 18;
    const ageMax = parsed.overrides.age_max ?? (bot.default_age_max as number | null) ?? 55;
    const gender = parsed.overrides.gender ?? (bot.default_gender as string | null) ?? "all";
    const budget = parsed.overrides.budget ?? (bot.default_daily_budget as number | null) ?? null;

    // Маппим destination → goal для launch-campaign
    const goalMap: Record<string, string> = {
      whatsapp: "whatsapp", site: "site-leads", traffic: "traffic", instagram: "traffic", messenger: "whatsapp",
    };
    const goal = goalMap[destination] ?? "whatsapp";

    // Готовим payload для launch-campaign (полностью валидный, с boost-флагом).
    const boostPayload = {
      goal,
      source_instagram_media_id: igMedia.id,
      campaignName: `IG-boost · ${igHit.shortcode} · ${new Date().toISOString().slice(0, 10)}`,
      adsetName: `IG-boost · ${ageMin}-${ageMax} · ${gender}`,
      adName: `IG-boost · ${igHit.shortcode}`,
      creativeName: `IG-boost · ${igHit.shortcode} · creative`,
      primaryText: igMedia.caption ?? "",
      headline: "",
      description: "",
      budget: budget,
      currency: cabMeta.currency ?? "KZT",
      scheduleMode: "now",
      targeting: {
        // Страна: если первый элемент гео — 2-буквенный ISO-код, иначе страна из дефолтов или KZ.
        country: (geo[0]?.length === 2
          ? geo[0].toUpperCase()
          : ((bot.default_country as string | null) || "KZ")),
        // Город: первый элемент гео, который НЕ выглядит как ISO-код (берём название).
        // launch-campaign сам резолвит city.key через Meta targetingsearch.
        city: (() => {
          const cityName = geo.find((g) => g && g.length > 2)
            ?? (bot.default_city as string | null)
            ?? null;
          return cityName ? { name: cityName, key: null } : null;
        })(),
        age_min: ageMin,
        age_max: ageMax,
        gender,
      },
      clientConfig: clientConfigFromCabinet(cabMeta, metaToken, budget),
    };

    const token = shortToken(10);
    const previewLines = [
      `📸 <b>Буст IG-публикации</b>`,
      `Пост: <a href="${igHit.permalink}">${igHit.shortcode}</a>${igMedia.media_type ? ` · ${igMedia.media_type}` : ""}`,
      igMedia.caption ? `Подпись: <i>${(igMedia.caption ?? "").slice(0, 120).replace(/[<>&]/g, "")}…</i>` : "",
      `Кабинет: <b>${cabMeta.name ?? cab.alias}</b>`,
      `Цель: <b>${destination}</b>`,
      `Бюджет/день: <b>${budget ?? "—"} ${cabMeta.currency ?? "KZT"}</b>`,
      `Гео: <b>${geo.join(", ") || "—"}</b>`,
      `Возраст: <b>${ageMin}–${ageMax}</b> · Пол: <b>${gender}</b>`,
      "",
      "Подтвердить запуск?",
    ].filter(Boolean).join("\n");

    const sentMsgId = await sendMessageWithKeyboard(
      bot.bot_token as string, chatId, previewLines,
      [[
        { text: "✅ Запустить", callback_data: `confirm:${token}` },
        { text: "❌ Отмена",    callback_data: `cancel:${token}` },
      ]],
      message.message_id,
    );

    await admin.from("ads_telegram_commands").upsert({
      project_id: bot.project_id, bot_id: bot.id, chat_id: chatId,
      cabinet_id: cab.cabinet_id, alias_used: cab.alias,
      from_user: fromUser, message_id: message.message_id ?? null,
      update_id: update.update_id, command_text: text,
      parsed_destination: destination, status: "pending_confirmation",
      ig_shortcode: igHit.shortcode, ig_media_id: igMedia.id, ig_permalink: igHit.permalink,
      confirmation_token: token, boost_payload: boostPayload,
      resolved_params: { destination, cabinet_id: cab.cabinet_id, budget_daily: budget, geo, age_min: ageMin, age_max: ageMax, gender, kind: "boost_existing" },
      reply_message_id: sentMsgId,
    }, { onConflict: "update_id" });

    return json({ ok: true });
  }

  // Ответ + запись
  let replyText = "";
  let status = "received";
  let resolvedCabinetId: string | null = null;
  let resolvedAlias: string | null = null;
  let resolvedParams: Record<string, unknown> | null = null;

  if (parsed.action === "help" || (!parsed.action && !mediaKind && !text.trim())) {
    replyText = HELP_TEXT;
    status = "help";
  } else if (parsed.action === "cabinets") {
    if (!cabs.length) {
      replyText = "Боту не выдан доступ ни к одному кабинету. Открой Настройки → Telegram для рекламы.";
    } else {
      const lines = cabs.map((c) => `• <code>${c.alias}</code> — ${c.ad_cabinets?.name ?? "—"}${c.is_default ? " (по умолчанию)" : ""}`);
      replyText = `<b>Доступные кабинеты:</b>\n${lines.join("\n")}`;
    }
    status = "cabinets";
  } else if (parsed.action === "defaults") {
    const geoArr = (bot.default_geo as string[] | null) ?? [];
    const geoStr = geoArr.length ? geoArr.join(", ") : [bot.default_city, bot.default_country].filter(Boolean).join(", ") || "—";
    const lines = [
      `Куда: <b>${bot.default_destination ?? "—"}</b>`,
      `Бюджет/день: <b>${bot.default_daily_budget ?? "—"} ₸</b>`,
      `Гео: <b>${geoStr}</b>`,
      `Возраст: <b>${bot.default_age_min ?? "—"}–${bot.default_age_max ?? "—"}</b>`,
      `Пол: <b>${bot.default_gender ?? "all"}</b>`,
      `Цель: <b>${bot.default_objective ?? "—"}</b>`,
    ];
    replyText = `<b>Дефолты бота:</b>\n${lines.join("\n")}`;
    status = "defaults";
  } else if (parsed.action === "status") {
    const { data: recent } = await admin
      .from("ads_telegram_commands")
      .select("created_at, parsed_destination, status, error")
      .eq("project_id", bot.project_id)
      .order("created_at", { ascending: false })
      .limit(5);
    const lines = (recent ?? []).map((r) => {
      const dt = new Date(r.created_at as string).toLocaleString("ru");
      return `• ${dt} · ${r.parsed_destination ?? "—"} · ${r.status}${r.error ? ` (${r.error})` : ""}`;
    });
    replyText = lines.length ? `<b>Последние запуски:</b>\n${lines.join("\n")}` : "Пока пусто.";
    status = "status";
  } else if (parsed.action === "launch") {
    const cab = findCabinetByAlias(parsed.alias);
    if (!mediaKind || !fileId || !mediaPath) {
      replyText = "⚠️ Нужно прислать фото или видео вместе с командой запуска.";
      status = "failed";
    } else if (!parsed.destination) {
      replyText = "⚠️ Не понял куда запускать. Пример: <code>/launch whatsapp</code> (также: site / traffic / messenger / instagram).";
      status = "failed";
    } else if (!cab) {
      replyText = parsed.alias
        ? `⚠️ Кабинет с алиасом <code>${parsed.alias}</code> не найден. Список: <code>/cabinets</code>.`
        : "⚠️ Боту не выдан доступ ни к одному кабинету. Открой Настройки → Telegram для рекламы.";
      status = "failed";
    } else {
      resolvedCabinetId = cab.cabinet_id;
      resolvedAlias = cab.alias;

      // ===== Полные настройки кабинета для launch-campaign =====
      const { data: cabRow } = await admin
        .from("ad_cabinets")
        .select(CABINET_META_SELECT)
        .eq("id", cab.cabinet_id)
        .maybeSingle();
      const cabMeta = cabRow as CabinetMetaRow | null;

      // Meta token: с кабинета → automation_settings → env.
      let metaToken = (cabMeta?.access_token as string | null) ?? "";
      if (!metaToken) {
        const { data: aset } = await admin.from("automation_settings").select("meta_access_token").eq("id", true).maybeSingle();
        metaToken = (aset?.meta_access_token as string | null) ?? "";
      }
      const missingFields = cabinetLaunchMissingFields(cabMeta, parsed.destination);
      if (missingFields.length > 0) {
        replyText = cabinetFieldsErrorText(cab.ad_cabinets?.name ?? cab.alias, missingFields);
        status = "failed";
      } else if (!metaToken) {
        replyText = "⚠️ Не настроен Meta access token. Открой Настройки → Подключить Meta.";
        status = "failed";
      } else {
        const geo = parsed.overrides.geo?.length
          ? parsed.overrides.geo
          : ((bot.default_geo as string[] | null)?.length
              ? (bot.default_geo as string[])
              : [bot.default_city, bot.default_country].filter(Boolean) as string[]);
        const ageMin = parsed.overrides.age_min ?? (bot.default_age_min as number | null) ?? 18;
        const ageMax = parsed.overrides.age_max ?? (bot.default_age_max as number | null) ?? 55;
        const gender = parsed.overrides.gender ?? (bot.default_gender as string | null) ?? "all";
        const budget = parsed.overrides.budget ?? (bot.default_daily_budget as number | null) ?? null;

        resolvedParams = {
          destination: parsed.destination,
          cabinet_id: cab.cabinet_id,
          budget_daily: budget,
          geo, age_min: ageMin, age_max: ageMax, gender,
          objective: bot.default_objective ?? null,
          kind: "telegram_media_launch",
        };

        // destination → launch-campaign goal
        const goalMap: Record<string, string> = {
          whatsapp: "whatsapp",
          messenger: "whatsapp",
          site: "site-leads",
          traffic: "traffic",
          instagram: "traffic",
        };
        const goal = goalMap[parsed.destination] ?? "whatsapp";

        // Подпись из ТГ (без команды) → primary text. Если пусто — мягкий дефолт.
        const captionText = (text || "").replace(/^[\s\S]*?\b(?:launch|launch|запусти|старт|start)\b\s*\S*/i, "").trim();
        const primaryText = captionText
          || (goal === "whatsapp" ? "Напишите нам в WhatsApp - ответим быстро." : "Узнайте подробнее.");

        // Скачиваем медиа из storage и собираем File для launch-campaign.
        const { data: blob, error: dlErr } = await admin.storage
          .from("ads-telegram-media").download(mediaPath);
        if (dlErr || !blob) {
          replyText = `⚠️ Не смог прочитать медиа из хранилища: ${dlErr?.message ?? "unknown"}.`;
          status = "failed";
        } else {
          const ext = mediaPath.split(".").pop()?.toLowerCase() || "bin";
          const ct = blob.type || (mediaKind === "video" ? "video/mp4" : "image/jpeg");
          const arr = new Uint8Array(await blob.arrayBuffer());
          const file = new File([arr], `tg-${crypto.randomUUID()}.${ext}`, { type: ct });

          const launchId = crypto.randomUUID();
          const dateTag = new Date().toISOString().slice(0, 10);
          const payload: Record<string, unknown> = {
            launchId,
            goal,
            campaignName: `TG · ${parsed.destination} · ${dateTag}`,
            adsetName: `TG · ${ageMin}-${ageMax} · ${gender}`,
            adName: `TG · ${parsed.destination} · ${cabMeta!.name ?? cab.alias}`,
            creativeName: `TG · ${parsed.destination} · creative`,
            primaryText,
            headline: "",
            description: "",
            budget,
            currency: cabMeta!.currency ?? "KZT",
            scheduleMode: "now",
            targeting: {
              country: (geo[0]?.length === 2
                ? geo[0].toUpperCase()
                : ((bot.default_country as string | null) || "KZ")),
              city: (() => {
                const cityName = geo.find((g) => g && g.length > 2)
                  ?? (bot.default_city as string | null) ?? null;
                return cityName ? { name: cityName, key: null } : null;
              })(),
              age_min: ageMin,
              age_max: ageMax,
              gender,
            },
            clientConfig: clientConfigFromCabinet(cabMeta!, metaToken, budget),
          };

          // Заводим запись ad_campaigns ДО запуска (launch-campaign делает UPDATE WHERE launch_id=…).
          await admin.from("ad_campaigns").insert({
            cabinet_id: cab.cabinet_id,
            project_id: bot.project_id,
            goal,
            budget: budget != null ? String(budget) : null,
            text: primaryText,
            campaign_name: String(payload.campaignName),
            adset_name: String(payload.adsetName),
            ad_name: String(payload.adName),
            launch_id: launchId,
            status: "queued",
            status_step: "telegram_launch_queued",
            status_message: "Запущено из Telegram-бота (media)",
            created_by: null,
          });

          const fd = new FormData();
          fd.append("payload", JSON.stringify(payload));
          fd.append("creative_feed", file, file.name);

          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          let launchOk = false;
          let launchErr = "";
          let launchMeta: { metaCampaignId?: string; metaAdId?: string } = {};
          try {
            const res = await fetch(`${supabaseUrl}/functions/v1/launch-campaign`, {
              method: "POST",
              headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
              body: fd,
              signal: AbortSignal.timeout(180_000),
            });
            const j = await res.json().catch(() => ({})) as any;
            if (res.ok && j.ok) {
              launchOk = true;
              launchMeta = { metaCampaignId: j.metaCampaignId, metaAdId: j.metaAdId };
            } else {
              launchErr = j.error ?? j.step ?? `HTTP ${res.status}`;
            }
          } catch (e) {
            launchErr = (e as Error).message;
          }

          status = launchOk ? "launched" : "failed";
          (resolvedParams as Record<string, unknown>).launch_id = launchId;

          const ageStr = `${ageMin}-${ageMax}`;
          replyText = launchOk
            ? `✅ Запущено в Meta!\n` +
              `• Кабинет: <b>${cabMeta!.name ?? cab.alias}</b>\n` +
              `• Цель: <b>${parsed.destination}</b>\n` +
              `• Бюджет/день: <b>${budget ?? "-"} ${cabMeta!.currency ?? "KZT"}</b>\n` +
              `• Гео: <b>${(geo as string[]).join(", ") || "-"}</b>\n` +
              `• Возраст: <b>${ageStr}</b> · Пол: <b>${gender}</b>\n` +
              `• Campaign: <code>${launchMeta.metaCampaignId ?? "?"}</code>\n` +
              `• Ad: <code>${launchMeta.metaAdId ?? "?"}</code>`
            : `❌ Запуск не удался: ${launchErr.slice(0, 400)}\n\nКабинет: <b>${cabMeta!.name ?? cab.alias}</b>, цель: <b>${parsed.destination}</b>.`;
        }
      }
    }
  } else if (mediaKind) {
    replyText =
      "📎 Медиа сохранил. Добавь команду в подпись, например: <code>/launch whatsapp</code>.";
    status = "received";
  } else {
    replyText = "Не понял команду. Напиши <code>/help</code>.";
    status = "ignored";
  }

  const replyMsgId = await sendMessage(bot.bot_token as string, chatId, replyText, message.message_id);

  await admin.from("ads_telegram_commands").upsert({
    project_id: bot.project_id,
    bot_id: bot.id,
    cabinet_id: resolvedCabinetId,
    alias_used: resolvedAlias,
    resolved_params: resolvedParams,
    chat_id: chatId,
    from_user: fromUser,
    message_id: message.message_id ?? null,
    update_id: update.update_id,
    command_text: text || null,
    parsed_destination: parsed.destination,
    media_kind: mediaKind,
    media_url: mediaPath,
    status,
    reply_message_id: replyMsgId,
  }, { onConflict: "update_id" });

  return json({ ok: true });
});