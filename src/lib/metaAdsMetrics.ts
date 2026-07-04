/** Meta Ads: клики, WhatsApp и лиды с сайта — разные метрики. */

export type MetaTrafficTotals = {
  spend: number;
  clicks: number;
  leads: number;
  messages: number;
};

export type MetaAction = { action_type: string; value: string };

/** Только пиксель сайта — однозначно «лиды с сайта». */
const PIXEL_LEAD_ACTIONS = [
  "offsite_conversion.fb_pixel_lead",
  "onsite_web_lead",
];

/**
 * Общий `lead` Meta использует и для форм, и для WhatsApp.
 * Без destination нельзя считать это лидом сайта.
 */
const GENERIC_LEAD_ACTIONS = [
  "lead",
  "leadgen.other",
  "onsite_conversion.lead_grouped",
];

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

/** Тип результата кампании: куда класть конверсии. */
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

/**
 * Определяет тип кампании.
 * Priority: destination → optimization_goal → objective → имя кампании.
 */
export function campaignResultKind(
  destinationType: string | null | undefined,
  objective?: string | null,
  optimizationGoal?: string | null,
  campaignName?: string | null,
): CampaignResultKind {
  const dest = (destinationType ?? "").toUpperCase();
  const obj = (objective ?? "").toUpperCase();
  const opt = (optimizationGoal ?? "").toUpperCase();
  const name = (campaignName ?? "").toLowerCase();

  if (isMessagingDestination(dest)) return "whatsapp";
  if (isSiteLeadDestination(dest)) return "site_leads";

  if (/CONVERSATION|MESSAGING|WHATSAPP|REPLIES|MESSAGE/.test(opt)) return "whatsapp";
  if (/LEAD|QUALITY_LEAD/.test(opt)) return "site_leads";
  if (/LINK_CLICK|LANDING_PAGE_VIEWS|REACH|IMPRESSIONS|THRUPLAY/.test(opt)) return "traffic";

  if (/MESSAGE|CONVERSATION/.test(obj)) return "whatsapp";
  // Engagement без явного lead — чаще сообщения (WA / Direct)
  if (/ENGAGEMENT/.test(obj) && !/LEAD/.test(obj)) return "whatsapp";
  if (/LEAD|SALES|CONVERSION/.test(obj)) return "site_leads";
  if (/TRAFFIC|LINK_CLICK/.test(obj)) return "traffic";

  // Имя кампании (агентства часто пишут WA / сайт / трафик в названии)
  if (/whats?app|\bwa\b|вотсап|ватсап|сообщен|messenger|direct/.test(name)) return "whatsapp";
  if (/сайт|site|лендинг|landing|pixel|пиксель|форм/.test(name)) return "site_leads";
  if (/трафик|traffic|клик|click/.test(name)) return "traffic";

  return "other";
}

/**
 * Раскладывает сырые actions Meta в колонки по типу кампании.
 * Клики сюда не входят.
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
    // Meta часто пишет переписку в `lead` — в лиды сайта не кладём.
    return { leads: 0, messages: Math.max(rawMessages, genericLeads, pixelLeads) };
  }

  if (kind === "traffic") {
    // Трафик = только клики. Конверсии в колонки не пишем.
    return { leads: 0, messages: 0 };
  }

  if (kind === "site_leads") {
    // Сайт / формы: пиксель или формы. Messaging action на сайте редок.
    const site = Math.max(pixelLeads, genericLeads);
    if (rawMessages > 0 && site >= rawMessages) {
      return { leads: Math.max(site - rawMessages, 0), messages: 0 };
    }
    return { leads: site, messages: 0 };
  }

  // Неизвестный тип: пиксель → сайт; messaging action → WA;
  // голый `lead` без признаков сайта — WhatsApp (click-to-WA).
  if (rawMessages > 0) {
    return {
      leads: pixelLeads,
      messages: Math.max(rawMessages, genericLeads > pixelLeads ? genericLeads : 0),
    };
  }
  if (pixelLeads > 0) {
    return { leads: Math.max(pixelLeads, genericLeads), messages: 0 };
  }
  if (genericLeads > 0) {
    return { leads: 0, messages: genericLeads };
  }
  return { leads: 0, messages: 0 };
}

/** Переразложить уже сохранённые leads/messages по типу кампании. */
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
    return { leads: 0, messages: Math.max(m, l) };
  }
  if (kind === "traffic") {
    return { leads: 0, messages: 0 };
  }
  if (kind === "site_leads") {
    if (m > 0 && l >= m) return { leads: l - m, messages: 0 };
    return { leads: l, messages: 0 };
  }
  // other без метаданных: messaging action уже в m; иначе голый lead → WA
  if (m > 0 && l >= m) return { leads: l - m, messages: m };
  if (m > 0) return { leads: l, messages: m };
  if (l > 0) return { leads: 0, messages: l };
  return { leads: 0, messages: 0 };
}

/** Лиды с сайта / pixel / формы (не WhatsApp, не клики). */
export function metaFormLeads(t: Pick<MetaTrafficTotals, "leads">): number {
  return Math.max(0, t.leads ?? 0);
}

/** Начатые переписки WhatsApp / Messenger. */
export function metaMessages(t: Pick<MetaTrafficTotals, "messages">): number {
  return Math.max(0, t.messages ?? 0);
}

/** Все конверсии Meta без кликов: сайт + WhatsApp. */
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
