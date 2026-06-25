// Прямой запуск рекламы в Meta из «Управление рекламой».
// Цель: Engagement, оптимизация на сообщения в WhatsApp.
//
// POST { cabinet_id: uuid, action: "launch" | "pause" | "resume" }
//   - launch: создаёт campaign + adset + creative + ad по настройкам кабинета и
//             запускает их (status=ACTIVE).
//   - pause / resume: переключает уже созданную кампанию.
//
// Auth: Bearer JWT. Доступ к кабинету проверяется через RLS (createUserClient).
// Meta-токен берётся из automation_settings.meta_access_token (admin-only).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v21.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeActId(id: string): string {
  const t = (id ?? "").trim();
  if (!t) return "";
  if (/^act_\d+$/i.test(t)) return t;
  if (/^\d+$/.test(t)) return `act_${t}`;
  return t;
}

function onlyDigits(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

type FbErr = { error?: { message?: string; error_user_msg?: string; code?: number } };
async function fb<T = unknown>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${GRAPH}${path}`;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  const params = new URLSearchParams();
  params.set("access_token", token);
  if (body && method !== "GET") {
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue;
      params.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    init.body = params.toString();
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  }
  const u = method === "GET"
    ? `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`
    : url;
  const r = await fetch(u, init);
  const text = await r.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  if (!r.ok) {
    const e = parsed as FbErr;
    const msg = e?.error?.error_user_msg ?? e?.error?.message ?? text;
    throw new Error(`Meta ${method} ${path}: ${msg}`);
  }
  return parsed as T;
}

/** Грузим картинку в кабинет → возвращает image_hash. */
async function uploadImage(
  actId: string,
  imageUrl: string,
  token: string,
): Promise<string> {
  // Берём байты картинки на нашей стороне и POST-им мультипартом в /adimages
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`Не могу скачать креатив (${imgResp.status})`);
  const blob = await imgResp.blob();
  const fd = new FormData();
  fd.append("access_token", token);
  // имя файла важно — Meta использует его как ключ хеша
  const ext = (imageUrl.split(".").pop() ?? "jpg").toLowerCase().slice(0, 4);
  fd.append("filename", new File([blob], `creative.${ext}`, { type: blob.type || "image/jpeg" }));
  const r = await fetch(`${GRAPH}/${actId}/adimages?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    body: fd,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(`Meta upload image: ${data?.error?.error_user_msg ?? data?.error?.message ?? "unknown"}`);
  }
  const images = data?.images as Record<string, { hash: string }> | undefined;
  const first = images ? Object.values(images)[0] : null;
  if (!first?.hash) throw new Error("Meta не вернул image_hash");
  return first.hash;
}

type Cabinet = {
  id: string;
  project_id: string | null;
  name: string;
  external_id: string | null;
  ad_account_id: string | null;
  page_id: string | null;
  whatsapp_number: string | null;
  campaign_objective: string | null;
  daily_budget: number | null;
  currency: string | null;
  target_geo: string[] | null;
  target_age_min: number | null;
  target_age_max: number | null;
  target_gender: string | null;
  creative_primary_text: string | null;
  creative_headline: string | null;
  creative_description: string | null;
  creative_media_urls: string[] | null;
  meta_launched_campaign_id: string | null;
  meta_launched_adset_id: string | null;
  meta_launched_ad_id: string | null;
  meta_launched_creative_id: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

  let body: { cabinet_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const cabinetId = body.cabinet_id;
  const action = (body.action ?? "launch") as "launch" | "pause" | "resume";
  if (!cabinetId || !["launch", "pause", "resume"].includes(action)) {
    return json({ error: "cabinet_id и action: launch|pause|resume обязательны" }, 400);
  }

  // Доступ к кабинету через RLS
  const { data: cab, error: cabErr } = await userClient
    .from("ad_cabinets")
    .select(
      "id,project_id,name,external_id,ad_account_id,page_id,whatsapp_number,campaign_objective,daily_budget,currency,target_geo,target_age_min,target_age_max,target_gender,creative_primary_text,creative_headline,creative_description,creative_media_urls,meta_launched_campaign_id,meta_launched_adset_id,meta_launched_ad_id,meta_launched_creative_id",
    )
    .eq("id", cabinetId)
    .maybeSingle();
  if (cabErr || !cab) return json({ error: "Кабинет не найден или нет доступа" }, 403);
  const cabinet = cab as Cabinet;

  // Meta-токен (service_role читает automation_settings)
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: settings } = await admin
    .from("automation_settings")
    .select("meta_access_token")
    .eq("id", true)
    .maybeSingle();
  const token = (settings?.meta_access_token as string | undefined) ?? Deno.env.get("META_ACCESS_TOKEN") ?? "";
  if (!token) return json({ error: "Meta-токен не настроен в Настройках → Автоматизация" }, 400);

  const actRaw = cabinet.ad_account_id || cabinet.external_id || "";
  const actId = normalizeActId(actRaw);
  if (!actId) return json({ error: "У кабинета не задан ad_account_id" }, 400);

  // ───── PAUSE / RESUME ─────
  if (action === "pause" || action === "resume") {
    if (!cabinet.meta_launched_campaign_id) {
      return json({ error: "Кампания ещё не запущена в Meta" }, 400);
    }
    const status = action === "pause" ? "PAUSED" : "ACTIVE";
    try {
      await fb("POST", `/${cabinet.meta_launched_campaign_id}`, token, { status });
      await admin.from("ad_cabinets").update({
        launch_status: status === "ACTIVE" ? "active" : "paused",
        online: status === "ACTIVE",
        last_launch_error: null,
      }).eq("id", cabinet.id);
      return json({ ok: true, status });
    } catch (e) {
      const msg = (e as Error).message;
      await admin.from("ad_cabinets").update({ last_launch_error: msg }).eq("id", cabinet.id);
      return json({ error: msg }, 502);
    }
  }

  // ───── LAUNCH ─────
  if (cabinet.meta_launched_campaign_id) {
    return json({
      error:
        "Кампания уже запущена в Meta. Используйте pause/resume или создайте новый запуск через мастер.",
      campaign_id: cabinet.meta_launched_campaign_id,
    }, 409);
  }

  // Валидация обязательных полей
  const missing: string[] = [];
  if (!cabinet.page_id) missing.push("Facebook Page ID");
  if (!cabinet.whatsapp_number) missing.push("WhatsApp номер");
  if (!cabinet.daily_budget || cabinet.daily_budget <= 0) missing.push("Дневной бюджет");
  if (!cabinet.creative_primary_text) missing.push("Основной текст креатива");
  if (!cabinet.creative_media_urls?.length) missing.push("Медиа для креатива");
  if (!cabinet.target_geo?.length) missing.push("Гео-таргетинг");
  if (missing.length) {
    const msg = `Заполните в кабинете: ${missing.join(", ")}`;
    await admin.from("ad_cabinets").update({ launch_status: "error", last_launch_error: msg }).eq("id", cabinet.id);
    return json({ error: msg }, 400);
  }

  // Помечаем как launching
  await admin.from("ad_cabinets").update({
    launch_status: "launching",
    last_launch_error: null,
  }).eq("id", cabinet.id);

  const waPhone = onlyDigits(cabinet.whatsapp_number!);
  const currency = (cabinet.currency || "USD").toUpperCase();
  // Бюджет в минимальных единицах валюты (центах/тиынах)
  const dailyBudgetMinor = Math.max(100, Math.round((cabinet.daily_budget || 0) * 100));

  try {
    // 1) Загружаем картинку в кабинет
    const imageHash = await uploadImage(actId, cabinet.creative_media_urls![0], token);

    // 2) Campaign — Engagement, начинаем в PAUSED, затем активируем
    const campaignName = `${cabinet.name} · WA · ${new Date().toISOString().slice(0, 10)}`;
    const camp = await fb<{ id: string }>("POST", `/${actId}/campaigns`, token, {
      name: campaignName,
      objective: "OUTCOME_ENGAGEMENT",
      status: "PAUSED",
      special_ad_categories: [],
      buying_type: "AUCTION",
    });

    // 3) Ad Set: destination_type=WHATSAPP, optimization_goal=CONVERSATIONS, promoted_object=page
    const targeting: Record<string, unknown> = {
      geo_locations: { countries: (cabinet.target_geo ?? []).filter((c) => c.length === 2) },
      age_min: cabinet.target_age_min ?? 18,
      age_max: cabinet.target_age_max ?? 65,
      publisher_platforms: ["facebook", "instagram"],
      facebook_positions: ["feed", "story"],
      instagram_positions: ["stream", "story", "reels"],
    };
    if (cabinet.target_gender === "male") targeting.genders = [1];
    else if (cabinet.target_gender === "female") targeting.genders = [2];

    const startISO = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const adset = await fb<{ id: string }>("POST", `/${actId}/adsets`, token, {
      name: `${campaignName} · adset`,
      campaign_id: camp.id,
      daily_budget: dailyBudgetMinor,
      billing_event: "IMPRESSIONS",
      optimization_goal: "CONVERSATIONS",
      destination_type: "WHATSAPP",
      promoted_object: {
        page_id: cabinet.page_id,
        whatsapp_phone_number: waPhone,
      },
      targeting,
      start_time: startISO,
      status: "PAUSED",
      currency,
    });

    // 4) Creative — link_data с CTA WHATSAPP_MESSAGE и ссылкой wa.me
    const waLink = `https://wa.me/${waPhone}`;
    const creative = await fb<{ id: string }>("POST", `/${actId}/adcreatives`, token, {
      name: `${campaignName} · creative`,
      object_story_spec: {
        page_id: cabinet.page_id,
        link_data: {
          link: waLink,
          message: cabinet.creative_primary_text,
          name: cabinet.creative_headline || undefined,
          description: cabinet.creative_description || undefined,
          image_hash: imageHash,
          call_to_action: {
            type: "WHATSAPP_MESSAGE",
            value: { app_destination: "WHATSAPP", link: waLink },
          },
        },
      },
      degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } } },
    });

    // 5) Ad
    const ad = await fb<{ id: string }>("POST", `/${actId}/ads`, token, {
      name: `${campaignName} · ad`,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status: "PAUSED",
    });

    // 6) Активируем всё разом: campaign → adset → ad
    await fb("POST", `/${camp.id}`, token, { status: "ACTIVE" });
    await fb("POST", `/${adset.id}`, token, { status: "ACTIVE" });
    await fb("POST", `/${ad.id}`, token, { status: "ACTIVE" });

    // Сохраняем IDs в кабинет
    await admin.from("ad_cabinets").update({
      meta_launched_campaign_id: camp.id,
      meta_launched_adset_id: adset.id,
      meta_launched_ad_id: ad.id,
      meta_launched_creative_id: creative.id,
      last_launched_at: new Date().toISOString(),
      last_launch_error: null,
      launch_status: "active",
      online: true,
    }).eq("id", cabinet.id);

    return json({
      ok: true,
      campaign_id: camp.id,
      adset_id: adset.id,
      ad_id: ad.id,
      creative_id: creative.id,
    });
  } catch (e) {
    const msg = (e as Error).message || "Неизвестная ошибка Meta API";
    await admin.from("ad_cabinets").update({
      launch_status: "error",
      last_launch_error: msg,
    }).eq("id", cabinet.id);
    return json({ error: msg }, 502);
  }
});