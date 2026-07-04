/**
 * Meta Ads: WhatsApp-сообщения и лиды с сайта — разные метрики.
 *
 * Meta часто пишет начатые переписки и в `lead` / `onsite_conversion.lead_grouped`.
 * Колонки заполняем по destination / objective / optimization_goal кампании.
 */

export type MetaAction = { action_type: string; value: string };

const PIXEL_LEAD_ACTIONS = [
  "offsite_conversion.fb_pixel_lead",
  "onsite_web_lead",
];

const GENERIC_LEAD_ACTIONS = [
  "lead",
  "leadgen.other",
  "onsite_conversion.lead_grouped",
];

export const LEAD_ACTIONS = [...PIXEL_LEAD_ACTIONS, ...GENERIC_LEAD_ACTIONS];

export const MESSAGING_ACTIONS = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.messaging_conversation_started_28d",
  "onsite_conversion.total_messaging_connection",
  "onsite_conversion.messaging_first_reply",
];

export const PURCHASE_ACTIONS = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
];

export function maxAction(actions: MetaAction[] | undefined, types: string[]): number {
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

export function sumActions(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  return actions
    .filter((a) => types.includes(a.action_type))
    .reduce((s, a) => s + Number(a.value || 0), 0);
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
  if (/ENGAGEMENT/.test(obj) && !/LEAD/.test(obj)) return "whatsapp";
  if (/LEAD|SALES|CONVERSION/.test(obj)) return "site_leads";
  if (/TRAFFIC|LINK_CLICK/.test(obj)) return "traffic";

  if (/whats?app|\bwa\b|вотсап|ватсап|сообщен|messenger|direct/.test(name)) return "whatsapp";
  if (/сайт|site|лендинг|landing|pixel|пиксель|форм/.test(name)) return "site_leads";
  if (/трафик|traffic|клик|click/.test(name)) return "traffic";

  return "other";
}

export type SplitMetrics = { leads: number; messages: number };

export function splitLeadsAndMessages(
  actions: MetaAction[] | undefined,
  destinationType: string | null | undefined,
  objective?: string | null,
  optimizationGoal?: string | null,
  campaignName?: string | null,
): SplitMetrics {
  const pixelLeads = maxAction(actions, PIXEL_LEAD_ACTIONS);
  const genericLeads = maxAction(actions, GENERIC_LEAD_ACTIONS);
  const rawMessages = maxAction(actions, MESSAGING_ACTIONS);
  const kind = campaignResultKind(destinationType, objective, optimizationGoal, campaignName);

  if (kind === "whatsapp") {
    return { leads: 0, messages: Math.max(rawMessages, genericLeads, pixelLeads) };
  }

  if (kind === "traffic") {
    return { leads: 0, messages: 0 };
  }

  if (kind === "site_leads") {
    const site = Math.max(pixelLeads, genericLeads);
    if (rawMessages > 0 && site >= rawMessages) {
      return { leads: Math.max(site - rawMessages, 0), messages: 0 };
    }
    return { leads: site, messages: 0 };
  }

  if (rawMessages > 0) {
    return {
      leads: pixelLeads,
      messages: Math.max(rawMessages, genericLeads > pixelLeads ? genericLeads : 0),
    };
  }
  if (pixelLeads > 0) {
    return { leads: Math.max(pixelLeads, genericLeads), messages: 0 };
  }
  // Голый `lead` без destination — WhatsApp (типичный click-to-WA в KZ).
  if (genericLeads > 0) {
    return { leads: 0, messages: genericLeads };
  }
  return { leads: 0, messages: 0 };
}

export function reclassifyStoredMetrics(
  leads: number,
  messages: number,
  destinationType: string | null | undefined,
  objective?: string | null,
  optimizationGoal?: string | null,
  campaignName?: string | null,
): SplitMetrics {
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
  if (m > 0 && l >= m) return { leads: l - m, messages: m };
  if (m > 0) return { leads: l, messages: m };
  if (l > 0) return { leads: 0, messages: l };
  return { leads: 0, messages: 0 };
}
