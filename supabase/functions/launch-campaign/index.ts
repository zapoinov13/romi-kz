// Прямой запуск кампании в Meta Graph API (без n8n).
// 1. Принимает FormData от фронта.
// 2. Загружает креативы (изображения → /adimages, видео → /advideos).
// 3. Создаёт campaign → adset → adcreative → ad.
// 4. Пишет meta_campaign_id / meta_adset_id / meta_ad_id и статус в ad_campaigns.

import { requireUser, userHasRole } from "../_lib/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const META_GRAPH = "https://graph.facebook.com/v21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function pickStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Резолвит numeric Meta city key через targetingsearch. */
async function resolveMetaCityKey(
  name: string,
  countryCode: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const url = new URL(`${META_GRAPH}/search`);
    url.searchParams.set("type", "adgeolocation");
    url.searchParams.set("location_types", '["city"]');
    url.searchParams.set("q", name);
    url.searchParams.set("country_code", countryCode);
    url.searchParams.set("limit", "5");
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{ key?: string; name?: string; country_code?: string }>;
    };
    const hit = json.data?.find(
      (d) => (d.country_code ?? "").toUpperCase() === countryCode.toUpperCase() && d.key,
    );
    return hit?.key ? String(hit.key) : null;
  } catch (e) {
    console.warn("[resolveMetaCityKey]", (e as Error).message);
    return null;
  }
}

/** Унифицированный POST в Meta Graph API. Тело — JSON. */
async function metaPost(
  path: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; subcode?: number; code?: number }
> {
  try {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue;
      params.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    params.set("access_token", accessToken);
    const res = await fetch(`${META_GRAPH}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
      error?: { message?: string; error_user_msg?: string; error_subcode?: number; code?: number };
    };
    if (!res.ok || json.error) {
      const msg = json.error?.error_user_msg || json.error?.message || `HTTP ${res.status}`;
      console.error(`[metaPost ${path}] ${msg}`, JSON.stringify(json).slice(0, 600));
      return {
        ok: false,
        error: msg,
        subcode: json.error?.error_subcode,
        code: json.error?.code,
      };
    }
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Загружает видео в /advideos. Возвращает video_id. */
async function uploadVideoToMeta(
  adAccount: string,
  accessToken: string,
  file: File,
): Promise<{ id: string } | { error: string }> {
  try {
    const fd = new FormData();
    fd.append("source", file, file.name);
    fd.append("access_token", accessToken);
    const res = await fetch(`${META_GRAPH}/${adAccount}/advideos`, {
      method: "POST",
      body: fd,
      signal: AbortSignal.timeout(120_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string; error_user_msg?: string };
    };
    if (!res.ok || json.error || !json.id) {
      const msg = json.error?.error_user_msg || json.error?.message || `HTTP ${res.status}`;
      return { error: msg };
    }
    return { id: json.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Получает URL миниатюры загруженного видео (с polling, т.к. Meta обрабатывает видео асинхронно). */
async function fetchVideoThumbnailUrl(
  videoId: string,
  accessToken: string,
): Promise<string | null> {
  for (let i = 0; i < 8; i++) {
    try {
      const res = await fetch(
        `${META_GRAPH}/${videoId}/thumbnails?fields=uri,is_preferred&access_token=${encodeURIComponent(accessToken)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      const json = (await res.json().catch(() => ({}))) as {
        data?: Array<{ uri?: string; is_preferred?: boolean }>;
      };
      const items = json.data ?? [];
      if (items.length > 0) {
        const preferred = items.find((t) => t.is_preferred && t.uri);
        const any = items.find((t) => t.uri);
        const uri = (preferred ?? any)?.uri;
        if (uri) return uri;
      }
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

/**
 * Загружает изображение в Meta adimages API.
 * Возвращает { hash, url } или null при ошибке.
 */
async function uploadImageToMeta(
  adAccount: string,
  accessToken: string,
  file: File,
): Promise<{ hash: string; url: string } | null> {
  try {
    const fd = new FormData();
    fd.append(file.name, file, file.name);
    fd.append("access_token", accessToken);

    const res = await fetch(`${META_GRAPH}/${adAccount}/adimages`, {
      method: "POST",
      body: fd,
      signal: AbortSignal.timeout(30_000),
    });

    const data = (await res.json()) as {
      images?: Record<string, { hash?: string; url?: string }>;
      error?: { message?: string };
    };

    if (!res.ok || data.error) {
      console.error("[uploadImage] Meta error:", data.error?.message ?? JSON.stringify(data));
      return null;
    }

    const entry = data.images ? Object.values(data.images)[0] : null;
    if (entry?.hash) {
      return { hash: entry.hash, url: entry.url ?? "" };
    }
    return null;
  } catch (e) {
    console.error("[uploadImage] exception:", (e as Error).message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    const isAdmin = await userHasRole(auth.userId, "admin");
    const isManager = isAdmin || (await userHasRole(auth.userId, "manager"));
    if (!isManager) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Сначала пытаемся взять токен из automation_settings (тот, что подключён
    // через UI «Настройки → Подключить Meta»), затем фолбэк на env.
    let META_ACCESS_TOKEN = "";
    try {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: settings } = await admin
        .from("automation_settings")
        .select("meta_access_token")
        .eq("id", true)
        .maybeSingle();
      META_ACCESS_TOKEN =
        (settings?.meta_access_token as string | undefined) ?? "";
    } catch (e) {
      console.warn("[launch-campaign] failed to read automation_settings:", (e as Error).message);
    }
    if (!META_ACCESS_TOKEN) {
      META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN") ?? "";
    }
    if (!META_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({
          error:
            "Meta access token не настроен. Откройте Настройки → Подключить Meta и подключите токен.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const incoming = await req.formData();
    const payloadStr = incoming.get("payload");
    if (typeof payloadStr !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'payload' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(payloadStr) as Record<string, unknown>;
    const client = (payload.clientConfig ?? {}) as Record<string, unknown>;

    // ===== 1. ACCESS_TOKEN =====
    const accessToken = pickStr(
      client.fb_token,
      client.access_token,
      client.fbtoken,
      client.accesstoken,
      payload.ACCESS_TOKEN,
      META_ACCESS_TOKEN,
    );

    client.fb_token = accessToken;
    client.fbtoken = accessToken;
    client.access_token = accessToken;
    client.accesstoken = accessToken;
    payload.clientConfig = client;

    // ===== 2. AD_ACCOUNT =====
    const adAccountRaw = pickStr(
      client.ad_account_id,
      client.adaccountid,
      payload.ad_account_id,
      payload.AD_ACCOUNT,
    );
    const adAccount = adAccountRaw
      ? (adAccountRaw.startsWith("act_")
          ? adAccountRaw
          : `act_${adAccountRaw.replace(/^act_/, "").replace(/\D/g, "")}`)
      : "";

    if (!adAccount) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            "AD_ACCOUNT пуст: у выбранного кабинета не указан ad_account_id. Заполните его в настройках кабинета.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    client.ad_account_id = adAccount;
    client.adaccountid = adAccount;
    payload.clientConfig = client;
    payload.adAccount = adAccount;
    payload.ad_account_id = adAccount;

    // ===== 3. UPPER_CASE aliases =====
    const pageId = pickStr(client.page_id, client.pageid);
    const pageName = pickStr(client.page_name, client.pagename);
    const instagramId = pickStr(
      client.instagram_actor_id,
      client.instagram_user_id,
      client.instagramid,
    );
    const pixelId = pickStr(
      client.fb_pixel_id,
      client.pixel_id,
      client.pixelid,
      payload.pixelId,
    );
    const pixelEvent =
      pickStr(client.pixel_event, client.pixelevent, payload.pixelEvent) || "Lead";
    const websiteUrl = pickStr(
      client.website_url,
      client.landing_url,
      payload.websiteUrl,
    );
    const whatsappNumber = pickStr(
      client.whatsapp_number,
      client.whatsappnumber,
      payload.whatsappNumber,
    );
    const leadFormId = pickStr(
      client.lead_form_id,
      client.leadformid,
      payload.leadFormId,
    );

    payload.ACCESS_TOKEN = accessToken;
    payload.accesstoken = accessToken;
    payload.AD_ACCOUNT = adAccount;
    payload.PAGE_ID = pageId;
    payload.PAGE_NAME = pageName;
    payload.INSTAGRAM_ID = instagramId;
    payload.PIXEL_ID = pixelId;
    payload.PIXEL_EVENT = pixelEvent;
    payload.WEBSITE_URL = websiteUrl;
    payload.WHATSAPP_NUMBER = whatsappNumber;
    payload.BUSINESS_ID = pickStr(client.business_id);
    payload.APP_ID = pickStr(client.app_id);
    payload.LEAD_FORM_ID = leadFormId;

    // ===== 4. Цель кампании =====
    const goal = pickStr(payload.goal);
    const isWebsiteGoal = goal === "site-leads";
    const isMetaForm = goal === "meta-form";
    const isWhatsApp = goal === "whatsapp";
    const isTraffic = goal === "traffic";
    // ===== 4z. Boost существующей IG-публикации =====
    // Если передан source_instagram_media_id — мы продвигаем уже опубликованный
    // пост из подключённого IG-аккаунта (Telegram-бот, режим /launch <link>).
    const sourceInstagramMediaId = pickStr(
      payload.source_instagram_media_id,
      (payload as any).sourceInstagramMediaId,
    );
    const isBoostExisting = !!sourceInstagramMediaId;
    payload.isWebsiteGoal = isWebsiteGoal;
    payload.isMetaForm = isMetaForm;
    payload.isWhatsApp = isWhatsApp;
    payload.isTraffic = isTraffic;

    const goalLabel = isWebsiteGoal
      ? "Лиды с сайта"
      : isMetaForm
        ? "Лид-форма Meta"
        : isWhatsApp
          ? "WhatsApp"
          : isTraffic
            ? "Трафик"
            : goal;

    // ===== 4a. Таргетинг (страна / город / возраст / пол) =====
    const targetingInput = (payload.targeting ?? {}) as Record<string, unknown>;
    const clientTargeting = (client.targeting ?? {}) as Record<string, unknown>;
    const country = pickStr(
      targetingInput.country,
      Array.isArray(clientTargeting.countries) ? (clientTargeting.countries as string[])[0] : "",
    ) || "KZ";
    const cityObj = (targetingInput.city ?? clientTargeting.city ?? null) as
      | { key?: string; name?: string }
      | null;
    const ageMin = Number(targetingInput.age_min ?? clientTargeting.age_min ?? 18) || 18;
    const ageMax = Number(targetingInput.age_max ?? clientTargeting.age_max ?? 55) || 55;
    const genderRaw = pickStr(targetingInput.gender, clientTargeting.gender) || "all";
    const genders =
      genderRaw === "male" ? [1] : genderRaw === "female" ? [2] : [1, 2];

    // Передаём в n8n структуру, готовую к Meta API.
    // city.key из нашего справочника — не Meta city key; n8n при необходимости
    // резолвит его через targetingsearch по name + country.
    const trafficUrl = pickStr(payload.trafficUrl, client.traffic_url);

    payload.TARGETING = {
      country,
      city: cityObj && cityObj.name ? { key: cityObj.key ?? null, name: cityObj.name, country } : null,
      age_min: ageMin,
      age_max: ageMax,
      gender: genderRaw,
      genders,
    };
    payload.TRAFFIC_URL = trafficUrl;

    // ===== 4b. Имена и тексты креатива (приходят с фронта; есть fallback) =====
    const waDigits = whatsappNumber.replace(/\D/g, "").replace(/^0+/, "");

    const validationError = (() => {
      if (isWhatsApp) {
        if (!pageId) return "Для WhatsApp нужен Page ID кабинета.";
        if (waDigits.length < 10) {
          return "WhatsApp номер должен содержать минимум 10 цифр (выберите номер из списка Meta).";
        }
      }
      if (isWebsiteGoal) {
        if (!pixelId) return "Для лидов с сайта выберите пиксель.";
        if (!websiteUrl || !websiteUrl.startsWith("https://")) {
          return "Для лидов с сайта нужна ссылка https://…";
        }
      }
      if (isMetaForm) {
        if (!pageId) return "Для лид-формы Meta нужен Page ID.";
        if (!leadFormId) return "Выберите лид-форму Meta.";
      }
      if (isTraffic) {
        const url = trafficUrl || websiteUrl;
        if (!url || !url.startsWith("https://")) {
          return "Для трафика нужна ссылка https://…";
        }
      }
      return null;
    })();
    if (validationError) {
      return new Response(
        JSON.stringify({ ok: false, error: validationError, step: "validation" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dateTag = new Date().toISOString().slice(0, 10);
    const inCampaignName = pickStr(payload.campaignName) ||
      `${goalLabel} · ${cityObj?.name ?? country} · ${dateTag}`;
    const inAdsetName = pickStr(payload.adsetName) ||
      `${goalLabel} · ${ageMin}-${ageMax} · ${genderRaw}`;
    const inAdName = pickStr(payload.adName) || `${goalLabel} · ad`;
    const inCreativeName = pickStr(payload.creativeName) || `${inAdName} · creative`;
    const inHeadline = pickStr(payload.headline);
    const inPrimaryText = pickStr(payload.primaryText, payload.text);
    const inDescription = pickStr(payload.description);
    const inCta = pickStr(payload.cta);

    payload.launchSummary = {
      goal,
      goalLabel,
      cabinetName: pickStr(client.client_name),
      adAccountId: adAccount,
      pageId,
      instagramId,
      pixelId,
      pixelEvent,
      websiteUrl,
      whatsappNumber,
      leadFormId,
      trafficUrl,
      country,
      city: cityObj?.name ?? null,
      ageMin,
      ageMax,
      gender: genderRaw,
      budget: payload.budget ?? null,
      currency: payload.currency ?? client.currency ?? "USD",
    };

    // ===== 5. Meta campaign / adSet / ad bodies =====
    // A3: бюджет обязателен. Если ни client.daily_budget (в центах), ни payload.budget
    // (в основной валюте) не заданы — возвращаем 400, не подменяем тихо на 50¢.
    const dailyBudgetCents = (() => {
      const v = client.daily_budget;
      if (typeof v === "number" && v > 0) return Math.round(v);
      const b = Number(payload.budget);
      if (Number.isFinite(b) && b > 0) return Math.round(b * 100);
      return 0;
    })();
    if (dailyBudgetCents < 100) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Бюджет обязателен и должен быть ≥ 1 в основной валюте кабинета.",
          step: "validation",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Объекты конверсий маппятся к objective Meta:
    // - Lead/CompleteRegistration/Contact/SubmitApplication/Schedule → OUTCOME_LEADS
    // - Purchase/AddToCart/InitiateCheckout/AddPaymentInfo → OUTCOME_SALES
    // - ViewContent/PageView → OUTCOME_ENGAGEMENT (traffic-like)
    const evUp = (pixelEvent || "Lead").toUpperCase();
    const salesEvents = new Set(["PURCHASE", "ADD_TO_CART", "INITIATE_CHECKOUT", "ADD_PAYMENT_INFO", "SUBSCRIBE", "START_TRIAL"]);
    const siteLeadsObjective = salesEvents.has(evUp) ? "OUTCOME_SALES" : "OUTCOME_LEADS";

    const campaignBody: Record<string, unknown> = {
      name: inCampaignName,
      objective: isWebsiteGoal
        ? siteLeadsObjective
        : isMetaForm
          ? "OUTCOME_LEADS"
          : isTraffic
            ? "OUTCOME_TRAFFIC"
            : "OUTCOME_ENGAGEMENT",
      special_ad_categories: [],

      status: "ACTIVE",
      access_token: accessToken,
    };

    // Базовый таргетинг для Meta API. Meta не принимает служебное поле city_search
    // внутри targeting, поэтому город передаём только если есть валидный numeric city key.
    const targetingBlock: Record<string, unknown> = {
      age_min: ageMin,
      age_max: ageMax,
      genders,
      geo_locations: { countries: [country] },
      targeting_automation: { advantage_audience: 0 },
    };
    // Резолвим city key через Meta targetingsearch (наш ключ — slug, Meta хочет numeric).
    if (cityObj?.name) {
      const metaKey = /^\d+$/.test(String(cityObj.key ?? ""))
        ? String(cityObj.key)
        : await resolveMetaCityKey(cityObj.name, country, accessToken);
      if (metaKey) {
        targetingBlock.geo_locations = {
          cities: [{ key: metaKey, radius: 25, distance_unit: "kilometer" }],
        };
      } else {
        console.warn(`[launch-campaign] city "${cityObj.name}" не найден в Meta, используем страну ${country}`);
      }
    }
    // Автоматические плейсменты (Advantage+ Placements): не задаём
    // publisher_platforms / *_positions — Meta сама подберёт все доступные
    // (Feed, Stories, Reels, Explore, Audience Network, Messenger и т.д.).

    const adSetBody: Record<string, unknown> = {
      name: inAdsetName,
      daily_budget: String(dailyBudgetCents),
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      billing_event: "IMPRESSIONS",
      status: "ACTIVE",
      access_token: accessToken,
      targeting: targetingBlock,
    };

    // Старт показов: либо «сейчас» (через 5 минут — Meta требует start_time
    // в будущем при создании adset), либо с ближайшей полуночи по Алматы (UTC+5).
    {
      const scheduleMode = typeof payload.scheduleMode === "string" ? payload.scheduleMode : "tomorrow";
      if (scheduleMode === "now") {
        adSetBody.start_time = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      } else {
        const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;
        const almatyNow = new Date(Date.now() + ALMATY_OFFSET_MS);
        almatyNow.setUTCHours(24, 0, 0, 0); // следующая полночь в Алматы (в "псевдо-UTC")
        adSetBody.start_time = new Date(almatyNow.getTime() - ALMATY_OFFSET_MS).toISOString();
      }
    }

    if (isWebsiteGoal) {
      adSetBody.optimization_goal = "OFFSITE_CONVERSIONS";
      adSetBody.destination_type = "WEBSITE";
      adSetBody.promoted_object = {
        pixel_id: pixelId,
        custom_event_type: (pixelEvent || "Lead").toUpperCase(),
      };
    } else if (isMetaForm) {
      adSetBody.optimization_goal = "LEAD_GENERATION";
      adSetBody.destination_type = "ON_AD";
      adSetBody.promoted_object = { page_id: pageId };
    } else if (isWhatsApp) {
      adSetBody.optimization_goal = "CONVERSATIONS";
      adSetBody.destination_type = "WHATSAPP";
      adSetBody.promoted_object = {
        page_id: pageId,
        whatsapp_phone_number: waDigits || whatsappNumber,
      };
    } else if (isTraffic) {
      adSetBody.optimization_goal = "LINK_CLICKS";
      adSetBody.destination_type = "WEBSITE";
    }

    const defaultCta = isWebsiteGoal
      ? "LEARN_MORE"
      : isMetaForm
        ? "SIGN_UP"
        : isTraffic
          ? "LEARN_MORE"
          : "WHATSAPP_MESSAGE";
    const ctaType = inCta || defaultCta;
    const linkUrl = isWebsiteGoal
      ? (websiteUrl || pickStr(client.landing_url) || "https://facebook.com/")
      : isTraffic
        ? (trafficUrl || websiteUrl || pickStr(client.landing_url) || "https://facebook.com/")
        : isWhatsApp && (waDigits || whatsappNumber)
          ? `https://wa.me/${waDigits || whatsappNumber.replace(/\D/g, "")}`
          : "https://facebook.com/";

    // ===== 6. ЗАГРУЖАЕМ КРЕАТИВЫ В META (параллельно с созданием campaign/adset) =====
    const creativeFeedFile = incoming.get("creative_feed");
    const creativeStoriesFile = incoming.get("creative_stories");

    let feedImageHash: string | null = null;
    let feedImageUrl: string | null = null;
    let storiesImageHash: string | null = null;
    let storiesImageUrl: string | null = null;
    let feedVideoId: string | null = null;
    let storiesVideoId: string | null = null;
    const uploadErrors: string[] = [];

    const uploadTasks: Promise<void>[] = [];
    if (creativeFeedFile instanceof File) {
      if (creativeFeedFile.type.startsWith("image/")) {
        uploadTasks.push(uploadImageToMeta(adAccount, accessToken, creativeFeedFile).then((r) => {
          if (r) { feedImageHash = r.hash; feedImageUrl = r.url; } else uploadErrors.push("feed image upload failed");
        }));
      } else if (creativeFeedFile.type.startsWith("video/")) {
        uploadTasks.push(uploadVideoToMeta(adAccount, accessToken, creativeFeedFile).then((r) => {
          if ("id" in r) feedVideoId = r.id; else uploadErrors.push(`feed video: ${r.error}`);
        }));
      }
    }
    if (creativeStoriesFile instanceof File) {
      if (creativeStoriesFile.type.startsWith("image/")) {
        uploadTasks.push(uploadImageToMeta(adAccount, accessToken, creativeStoriesFile).then((r) => {
          if (r) { storiesImageHash = r.hash; storiesImageUrl = r.url; } else uploadErrors.push("stories image upload failed");
        }));
      } else if (creativeStoriesFile.type.startsWith("video/")) {
        uploadTasks.push(uploadVideoToMeta(adAccount, accessToken, creativeStoriesFile).then((r) => {
          if ("id" in r) storiesVideoId = r.id; else uploadErrors.push(`stories video: ${r.error}`);
        }));
      }
    }
    // Не ждём здесь — uploads пойдут параллельно созданию campaign/adset.
    const uploadsPromise = uploadTasks.length > 0
      ? Promise.all(uploadTasks)
      : Promise.resolve();

    // ===== 7. Готовим прямой запуск в Meta =====
    const launchId = typeof payload.launchId === "string" && payload.launchId
      ? payload.launchId
      : crypto.randomUUID();
    payload.launchId = launchId;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const updateLaunch = async (patch: Record<string, unknown>) => {
      await admin.from("ad_campaigns").update({
        ...patch,
        status_updated_at: new Date().toISOString(),
      }).eq("launch_id", launchId);
    };
    // Промежуточные статусы UX-уровня — не блокируем основной flow ради них.
    const updateLaunchAsync = (patch: Record<string, unknown>) => {
      void admin.from("ad_campaigns").update({
        ...patch,
        status_updated_at: new Date().toISOString(),
      }).eq("launch_id", launchId);
    };
    const fail = async (step: string, error: string) => {
      await updateLaunch({
        status: "error",
        status_step: step,
        last_error: error,
        completed_at: new Date().toISOString(),
      });
      return new Response(
        JSON.stringify({ ok: false, launchId, step, error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    };

    updateLaunchAsync({ status: "running", status_step: "creating_campaign", status_message: "Создаём кампанию в Meta" });

    // ===== 8. Campaign =====
    const campaignRes = await metaPost(`/${adAccount}/campaigns`, {
      name: campaignBody.name,
      objective: campaignBody.objective,
      status: campaignBody.status,
      special_ad_categories: campaignBody.special_ad_categories,
      is_adset_budget_sharing_enabled: false,
    }, accessToken);
    if (!campaignRes.ok) return await fail("creating_campaign", campaignRes.error);
    const metaCampaignId = String(campaignRes.data.id ?? "");
    if (!metaCampaignId) return await fail("creating_campaign", "Meta не вернула id кампании");
    updateLaunchAsync({ meta_campaign_id: metaCampaignId, status_step: "creating_adset", status_message: "Создаём adset" });

    // ===== 9. AdSet =====
    const adsetPayload: Record<string, unknown> = { ...adSetBody, campaign_id: metaCampaignId };
    delete adsetPayload.access_token;
    const adsetRes = await metaPost(`/${adAccount}/adsets`, adsetPayload, accessToken);
    if (!adsetRes.ok) {
      let humanMsg = adsetRes.error;
      // 2446814 = выбранное conversion event недоступно в выбранной цели
      if (adsetRes.subcode === 2446814) {
        const ev = (pixelEvent || "Lead").toUpperCase();
        humanMsg = isWebsiteGoal
          ? `Событие "${ev}" недоступно для цели "${siteLeadsObjective}" у пикселя ${pixelId}. Это значит либо событие не приходит на пиксель (проверьте Events Manager в Meta - оно должно гореть зелёным за последние 7 дней), либо событие относится к другой категории (Purchase → OUTCOME_SALES, Lead → OUTCOME_LEADS). Поменяйте событие в настройках кабинета или дождитесь первых событий.`
          : `Выбранное событие конверсии "${ev}" недоступно для этой цели. Поменяйте событие в настройках кабинета.`;
      }
      return await fail("creating_adset", humanMsg);
    }

    const metaAdsetId = String(adsetRes.data.id ?? "");
    if (!metaAdsetId) return await fail("creating_adset", "Meta не вернула id adset");
    updateLaunchAsync({ meta_adset_id: metaAdsetId, status_step: "creating_creative", status_message: "Создаём креатив" });

    // К этому моменту аплоады креативов чаще всего уже завершены, потому что
    // шли параллельно campaign+adset (~1.5–3с). Дожидаем их прежде чем строить креатив.
    await uploadsPromise;
    if (!isBoostExisting && !feedImageHash && !feedVideoId && !storiesImageHash && !storiesVideoId) {
      const msg = uploadErrors.join("; ") || "Не удалось загрузить креативы в Meta";
      return await fail("uploading_creatives", `Загрузка креативов в Meta не удалась: ${msg}`);
    }

    // ===== 10. AdCreative =====
    const message = inPrimaryText;
    const headlineText = inHeadline || message.slice(0, 40) || goalLabel;
    const cta = {
      type: ctaType,
      value: isWebsiteGoal || isTraffic
        ? { link: linkUrl }
        : isWhatsApp
          ? { app_destination: "WHATSAPP" }
          : isMetaForm && leadFormId
            ? { lead_gen_form_id: leadFormId }
            : {},
    };

    const videoId = feedVideoId || storiesVideoId;
    let storySpec: Record<string, unknown>;
    let creativeExtra: Record<string, unknown> = {};
    if (isBoostExisting) {
      // Boost существующего IG-поста: креатив строится из media_id, без upload.
      // CTA подменяется через degrees_of_freedom_spec / asset_feed_spec (Meta берёт
      // линк/кнопку из adset.destination_type + promoted_object). Минимально достаточно
      // указать page_id + instagram_actor_id и source_instagram_media_id.
      storySpec = {
        page_id: pageId,
        ...(instagramId ? { instagram_actor_id: instagramId } : {}),
      };
      creativeExtra = {
        source_instagram_media_id: sourceInstagramMediaId,
        // Для WhatsApp/site/traffic явно прокинем CTA — Meta использует её поверх поста.
        ...(isWhatsApp || isWebsiteGoal || isTraffic || isMetaForm
          ? {
              degrees_of_freedom_spec: {
                creative_features_spec: {
                  standard_enhancements: { enroll_status: "OPT_OUT" },
                },
              },
            }
          : {}),
      };
    } else if (videoId) {
      // Meta требует image_hash или image_url для video_data (thumbnail).
      let thumbUrl: string | null = feedImageUrl || storiesImageUrl;
      const thumbHash: string | null = feedImageHash || storiesImageHash;
      if (!thumbHash && !thumbUrl) {
        thumbUrl = await fetchVideoThumbnailUrl(videoId, accessToken);
      }
      if (!thumbHash && !thumbUrl) {
        return await fail(
          "creating_creative",
          "Не удалось получить миниатюру видео из Meta. Попробуйте загрузить креатив повторно через 1-2 минуты.",
        );
      }
      storySpec = {
        page_id: pageId,
        video_data: {
          video_id: videoId,
          message,
          title: headlineText,
          call_to_action: cta,
          ...(thumbHash ? { image_hash: thumbHash } : { image_url: thumbUrl! }),
          link_description: inDescription || undefined,
        },
      };
    } else {
      const linkData: Record<string, unknown> = {
        link: linkUrl,
        message,
        name: headlineText,
        image_hash: feedImageHash || storiesImageHash,
        call_to_action: cta,
      };
      if (inDescription) linkData.description = inDescription;
      if (isMetaForm && leadFormId) linkData.lead_gen_form_id = leadFormId;
      storySpec = { page_id: pageId, link_data: linkData };
    }

    const creativeRes = await metaPost(`/${adAccount}/adcreatives`, {
      name: inCreativeName,
      object_story_spec: storySpec,
      ...creativeExtra,
    }, accessToken);
    if (!creativeRes.ok) return await fail("creating_creative", creativeRes.error);
    const creativeId = String(creativeRes.data.id ?? "");
    if (!creativeId) return await fail("creating_creative", "Meta не вернула id креатива");

    // ===== 11. Ad =====
    updateLaunchAsync({ status_step: "creating_ad", status_message: "Создаём объявление" });
    const adRes = await metaPost(`/${adAccount}/ads`, {
      name: inAdName,
      adset_id: metaAdsetId,
      creative: { creative_id: creativeId },
      status: "ACTIVE",
    }, accessToken);
    if (!adRes.ok) return await fail("creating_ad", adRes.error);
    const metaAdId = String(adRes.data.id ?? "");

    await updateLaunch({
      meta_ad_id: metaAdId,
      status: "success",
      status_step: "done",
      status_message: "Кампания создана в Meta",
      last_error: null,
      completed_at: new Date().toISOString(),
    });

    // A-extra: дёргаем meta-structure-sync для этого кабинета, чтобы только что
    // созданная кампания сразу попала в meta_campaigns / meta_campaign_daily.
    // Fire-and-forget — не блокируем ответ.
    try {
      const { data: cabRow } = await admin
        .from("ad_cabinets")
        .select("id")
        .eq("external_id", adAccount.replace(/^act_/, ""))
        .maybeSingle();
      if (cabRow?.id) {
        void fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-structure-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ cabinet_id: cabRow.id }),
        }).catch(() => {});
      }
    } catch (_e) { /* noop */ }

    return new Response(
      JSON.stringify({
        ok: true,
        accepted: true,
        launchId,
        metaCampaignId,
        metaAdsetId,
        metaAdId,
        summary: payload.launchSummary,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
