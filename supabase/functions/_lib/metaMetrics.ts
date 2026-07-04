/**
 * Meta Ads: лиды (пиксель / цель «Лиды») и WhatsApp («Начатая переписка») — разные метрики.
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

export function isLeadCampaignObjective(objective: string | null | undefined): boolean {
  const obj = (objective ?? "").toUpperCase();
  return /OUTCOME_LEADS|LEAD_GENERATION|LEADS/.test(obj);
}

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
  if (/OUTCOME_ENGAGEMENT|ENGAGEMENT/.test(obj) && !/LEAD/.test(obj)) {
    return isMessagingDestination(destinationType) || /CONVERSATION|MESSAGING|WHATSAPP/.test(opt);
  }
  return false;
}

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

export type SplitMetrics = { leads: number; messages: number };

function whatsAppConversations(
  rawMessages: number,
  genericLeads: number,
  kind: CampaignResultKind,
): number {
  if (rawMessages > 0) return rawMessages;
  if (kind === "whatsapp" && genericLeads > 0) return genericLeads;
  return 0;
}

function siteLeadConversions(pixelLeads: number, genericLeads: number): number {
  return pixelLeads > 0 ? pixelLeads : genericLeads;
}

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
    return { leads: 0, messages: whatsAppConversations(rawMessages, genericLeads, kind) };
  }
  if (kind === "traffic") {
    return { leads: 0, messages: 0 };
  }
  if (kind === "site_leads") {
    return { leads: siteLeadConversions(pixelLeads, genericLeads), messages: 0 };
  }

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
