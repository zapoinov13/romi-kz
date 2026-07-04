/**
 * Meta Ads: клики, лиды (пиксель / цель «Лиды») и WhatsApp (начатая переписка) — разные метрики.
 *
 * Лиды — кампании OUTCOME_LEADS / LEAD_GENERATION: события пикселя (fb_pixel_lead) и формы.
 * WhatsApp — кампании «Вовлечённость» → написать в WA: в Ads Manager = «Начатая переписка»
 * (messaging_conversation_started_*).
 */

export type MetaTrafficTotals = {
  spend: number;
  clicks: number;
  leads: number;
  messages: number;
};

export type MetaAction = { action_type: string; value: string };

/** Пиксель сайта — «Лиды с сайта» в Ads Manager. */
const PIXEL_LEAD_ACTIONS = [
  "offsite_conversion.fb_pixel_lead",
  "onsite_web_lead",
];

/** Формы Meta и агрегат lead (без messaging action). */
const GENERIC_LEAD_ACTIONS = [
  "lead",
  "leadgen.other",
  "onsite_conversion.lead_grouped",
];

/** «Начатая переписка» в кабинете Meta. */
const MESSAGING_ACTIONS = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.messaging_conversation_started_28d",
  "onsite_conversion.total_messaging_connection",
  "onsite_conversion.messaging_first_reply",
];

function maxAction(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  let max = 0;
  for (const a of actions) {
    if (types.includes(a.action_type)) {
      const v = Number(a.value || 0);
      if (v > max) max = v;
    }
  }
  return max;
}

export type CampaignResultKind = "whatsapp" | "site_leads" | "traffic" | "other";

export function isMessagingDestination(dest: string | null | undefined): boolean {
  if (!dest) return false;
  const u = dest.toUpperCase();
  return (
    u.includes("WHATSAPP") ||
    u.includes("MESSENG") ||
    u === "INSTAGRAM_DIRECT" ||
    u.includes("MESSAGING")
  );
}

export function isSiteLeadDestination(dest: string | null | undefined): boolean {
  if (!dest) return false;
  const u = dest.toUpperCase();
  return (
    u === "WEBSITE" ||
    u === "WEBSITE_OR_AD" ||
    u === "ON_AD" ||
    u.includes("LEAD_FORM") ||
    u.includes("INSTANT_FORM") ||
    u.includes("LEADS_FORM")
  );
}

/** Цель кампании «Лиды» (пиксель / формы). */
export function isLeadCampaignObjective(objective: string | null | undefined): boolean {
  const obj = (objective ?? "").toUpperCase();
  return /OUTCOME_LEADS|LEAD_GENERATION|LEADS/.test(obj);
}

/** Цель «написать в WhatsApp / начать переписку». */
export function isWhatsAppCampaignObjective(
  objective: string | null | undefined,
  optimizationGoal?: string | null,
  destinationType?: string | null,
): boolean {
  const obj = (objective ?? "").toUpperCase();
  const opt = (optimizationGoal ?? "").toUpperCase();
  if (isMessagingDestination(destinationType)) return true;
  if (/CONVERSATION|MESSAGING|WHATSAPP|REPLIES/.test(opt)) return true;
  if (/MESSAGES|MESSAGE/.test(obj)) return true;
  // Вовлечённость → WA только с мессенджер-назначением или оптимизацией на переписку
  if (/OUTCOME_ENGAGEMENT|ENGAGEMENT/.test(obj) && !/LEAD/.test(obj)) {
    return isMessagingDestination(destinationType) || /CONVERSATION|MESSAGING|WHATSAPP/.test(opt);
  }
  return false;
}

/**
 * Куда класть конверсии кампании.
 * Priority: objective «Лиды» → WA/messaging → site destination → opt → имя.
 */
export function campaignResultKind(
  destinationType: string | null | undefined,
  objective?: string | null,
  optimizationGoal?: string | null,
  campaignName?: string | null,
): CampaignResultKind {
  const obj = (objective ?? "").toUpperCase();
  const opt = (optimizationGoal ?? "").toUpperCase();
  const name = (campaignName ?? "").toLowerCase();

  if (isLeadCampaignObjective(objective)) return "site_leads";
  if (isWhatsAppCampaignObjective(objective, optimizationGoal, destinationType)) return "whatsapp";
  if (isSiteLeadDestination(destinationType)) return "site_leads";

  if (/LEAD|QUALITY_LEAD|OFFSITE_CONVERSION/.test(opt)) return "site_leads";
  if (/LINK_CLICK|LANDING_PAGE_VIEWS|REACH|IMPRESSIONS|THRUPLAY/.test(opt)) return "traffic";

  if (/LEAD|SALES|CONVERSION/.test(obj)) return "site_leads";
  if (/TRAFFIC|LINK_CLICK/.test(obj)) return "traffic";

  if (/whats?app|\bwa\b|вотсап|ватсап|сообщен|messenger|instagram_direct|переписк/.test(name)) {
    return "whatsapp";
  }
  if (/сайт|site|лендинг|landing|pixel|пиксель|форм|лид/.test(name)) return "site_leads";
  if (/трафик|traffic|клик|click/.test(name)) return "traffic";

  return "other";
}

/** Счётчик «Начатая переписка»; generic lead — только если Meta не отдал messaging action. */
function whatsAppConversations(
  rawMessages: number,
  genericLeads: number,
  kind: CampaignResultKind,
): number {
  if (rawMessages > 0) return rawMessages;
  if (kind === "whatsapp" && genericLeads > 0) return genericLeads;
  return 0;
}

/** Счётчик лидов: пиксель приоритетнее generic lead. */
function siteLeadConversions(pixelLeads: number, genericLeads: number): number {
  return pixelLeads > 0 ? pixelLeads : genericLeads;
}

/**
 * Раскладывает actions Meta в колонки leads / messages по цели кампании.
 */
export function splitLeadsAndMessages(
  actions: MetaAction[] | undefined,
  destinationType: string | null | undefined,
  objective?: string | null,
  optimizationGoal?: string | null,
  campaignName?: string | null,
): { leads: number; messages: number } {
  const pixelLeads = maxAction(actions, PIXEL_LEAD_ACTIONS);
  const genericLeads = maxAction(actions, GENERIC_LEAD_ACTIONS);
  const rawMessages = maxAction(actions, MESSAGING_ACTIONS);
  const kind = campaignResultKind(destinationType, objective, optimizationGoal, campaignName);

  if (kind === "whatsapp") {
    return { leads: 0, messages: whatsAppConversations(rawMessages, genericLeads, kind) };
  }

  if (kind === "traffic") {
    return { leads: 0, messages: 0 };
  }

  if (kind === "site_leads") {
    return { leads: siteLeadConversions(pixelLeads, genericLeads), messages: 0 };
  }

  // Без метаданных: пиксель → лиды; messaging action → начатая переписка
  if (pixelLeads > 0 && rawMessages === 0) {
    return { leads: pixelLeads, messages: 0 };
  }
  if (rawMessages > 0 && pixelLeads === 0) {
    return { leads: 0, messages: rawMessages };
  }
  if (rawMessages > 0 && pixelLeads > 0) {
    return { leads: pixelLeads, messages: rawMessages };
  }
  if (genericLeads > 0) {
    return { leads: genericLeads, messages: 0 };
  }
  return { leads: 0, messages: 0 };
}

/** Переразложить сохранённые leads/messages по типу кампании. */
export function reclassifyStoredMetrics(
  leads: number,
  messages: number,
  destinationType: string | null | undefined,
  objective?: string | null,
  optimizationGoal?: string | null,
  campaignName?: string | null,
): { leads: number; messages: number } {
  const l = Math.max(0, Number(leads) || 0);
  const m = Math.max(0, Number(messages) || 0);
  const kind = campaignResultKind(destinationType, objective, optimizationGoal, campaignName);

  if (kind === "whatsapp") {
    return { leads: 0, messages: m > 0 ? m : l };
  }
  if (kind === "traffic") {
    return { leads: 0, messages: 0 };
  }
  if (kind === "site_leads") {
    if (m > 0 && l >= m) return { leads: l - m, messages: 0 };
    if (l > 0) return { leads: l, messages: 0 };
    if (m > 0) return { leads: m, messages: 0 };
    return { leads: 0, messages: 0 };
  }
  if (m > 0 && l === 0) return { leads: 0, messages: m };
  if (l > 0 && m === 0) return { leads: l, messages: 0 };
  if (m > 0 && l >= m) return { leads: l - m, messages: m };
  return { leads: l, messages: m };
}

/** Лиды: пиксель / формы (цель «Лиды»). */
export function metaFormLeads(t: Pick<MetaTrafficTotals, "leads">): number {
  return Math.max(0, t.leads ?? 0);
}

/** Начатые переписки WhatsApp (цель «Вовлечённость» → написать в WA). */
export function metaMessages(t: Pick<MetaTrafficTotals, "messages">): number {
  return Math.max(0, t.messages ?? 0);
}

export function metaConversionsTotal(t: Pick<MetaTrafficTotals, "leads" | "messages">): number {
  return metaFormLeads(t) + metaMessages(t);
}

export function metaCpc(t: MetaTrafficTotals): number {
  return t.clicks > 0 ? t.spend / t.clicks : 0;
}

export function metaCplForms(t: MetaTrafficTotals): number {
  const leads = metaFormLeads(t);
  return leads > 0 ? t.spend / leads : 0;
}

export function metaCostPerMessage(t: MetaTrafficTotals): number {
  const msgs = metaMessages(t);
  return msgs > 0 ? t.spend / msgs : 0;
}

export function metaCplAllConversions(t: MetaTrafficTotals): number {
  const conv = metaConversionsTotal(t);
  return conv > 0 ? t.spend / conv : 0;
}
