/**
 * Единый нейминг для запуска кампаний в Meta.
 * Кампания / adset / ad именуются по одному шаблону, чтобы менеджер мог
 * с одного взгляда понять, что это за запуск, в каком рекламном кабинете
 * и с какими параметрами.
 */

export type AdsGoal = "whatsapp" | "site-leads" | "meta-form" | "traffic";

export const GOAL_CODE: Record<AdsGoal, string> = {
  whatsapp: "WA",
  "site-leads": "SITE",
  "meta-form": "FORM",
  traffic: "TRAFFIC",
};

export const GOAL_LABEL: Record<AdsGoal, string> = {
  whatsapp: "WhatsApp",
  "site-leads": "Лиды с сайта",
  "meta-form": "Лид-форма Meta",
  traffic: "Трафик",
};

/** CTA, валидные для каждой цели в Meta Ads. */
export const CTA_BY_GOAL: Record<AdsGoal, { value: string; label: string }[]> = {
  whatsapp: [{ value: "WHATSAPP_MESSAGE", label: "Написать в WhatsApp" }],
  "site-leads": [
    { value: "LEARN_MORE", label: "Подробнее" },
    { value: "SIGN_UP", label: "Зарегистрироваться" },
    { value: "GET_OFFER", label: "Получить предложение" },
    { value: "SHOP_NOW", label: "В магазин" },
    { value: "BOOK_TRAVEL", label: "Забронировать" },
    { value: "CONTACT_US", label: "Связаться" },
  ],
  "meta-form": [
    { value: "SIGN_UP", label: "Зарегистрироваться" },
    { value: "APPLY_NOW", label: "Оставить заявку" },
    { value: "LEARN_MORE", label: "Подробнее" },
    { value: "GET_QUOTE", label: "Получить расчёт" },
  ],
  traffic: [
    { value: "LEARN_MORE", label: "Подробнее" },
    { value: "SHOP_NOW", label: "В магазин" },
    { value: "SEE_MORE", label: "Смотреть ещё" },
    { value: "WATCH_MORE", label: "Смотреть видео" },
  ],
};

export const defaultCtaForGoal = (g: AdsGoal): string => CTA_BY_GOAL[g][0].value;

/** 4-символьный hex-хеш от строки — добавляется в имена, чтобы при нескольких запусках в день они не сливались. */
export function shortHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 4).toUpperCase();
}

const sanitize = (s: string) => s.replace(/[|]/g, "-").trim();

const shortProject = (s: string | null | undefined, fallback: string) => {
  const v = sanitize(s ?? "");
  if (!v) return sanitize(fallback) || "Project";
  // 22 символа достаточно, чтобы поместить остальные части в лимит Meta (200 символов).
  return v.length > 22 ? v.slice(0, 22).trim() : v;
};

export interface NamingContext {
  goal: AdsGoal;
  projectName?: string | null;
  cabinetName?: string | null;
  countryName?: string | null;
  countryCode?: string | null;
  cityName?: string | null;
  ageMin: number;
  ageMax: number;
  gender: "all" | "male" | "female";
  launchId: string;
  /** Опционально — короткое имя креатива (например, "feed-photo"). */
  creativeLabel?: string;
}

const genderCode = (g: NamingContext["gender"]) =>
  g === "male" ? "M" : g === "female" ? "F" : "All";

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const geoPart = (ctx: NamingContext) =>
  sanitize(ctx.cityName || ctx.countryName || ctx.countryCode || "");

const projectPart = (ctx: NamingContext) =>
  shortProject(ctx.projectName, ctx.cabinetName ?? "");

export function buildCampaignName(ctx: NamingContext): string {
  const parts = [
    projectPart(ctx),
    GOAL_CODE[ctx.goal],
    geoPart(ctx),
    today(),
  ].filter(Boolean);
  return parts.join(" · ");
}

export function buildAdsetName(ctx: NamingContext): string {
  const tag = `ADS-${shortHash(ctx.launchId)}`;
  const parts = [
    projectPart(ctx),
    GOAL_CODE[ctx.goal],
    geoPart(ctx),
    `${ctx.ageMin}-${ctx.ageMax}`,
    genderCode(ctx.gender),
    tag,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function buildAdName(ctx: NamingContext): string {
  const tag = `AD-${shortHash(ctx.launchId)}`;
  const parts = [
    projectPart(ctx),
    GOAL_CODE[ctx.goal],
    sanitize(ctx.creativeLabel ?? ""),
    tag,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function buildCreativeName(adName: string): string {
  return `${adName} · creative`;
}

/** Нормализует телефон для wa.me / Meta promoted_object: оставляет цифры, обрезает ведущий 0. */
export function normalizeWhatsAppNumber(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.replace(/^0+/, "");
}

/** Минимальная валидация URL: должен быть https://… */
export function isHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}