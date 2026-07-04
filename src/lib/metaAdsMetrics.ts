/** Meta Ads: клики, WhatsApp и лиды с сайта — разные метрики. */

export type MetaTrafficTotals = {
  spend: number;
  clicks: number;
  leads: number;
  messages: number;
};

export type MetaAction = { action_type: string; value: string };

const LEAD_ACTIONS = [
  "lead",
  "leadgen.other",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "onsite_web_lead",
];

const MESSAGING_ACTIONS = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.messaging_conversation_started_28d",
  "onsite_conversion.total_messaging_connection",
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

/**
 * WhatsApp → messages; сайт / формы → leads.
 * Meta часто пишет переписки и в action `lead` — по destination не кладём их в лиды.
 */
export function splitLeadsAndMessages(
  actions: MetaAction[] | undefined,
  destinationType: string | null | undefined,
): { leads: number; messages: number } {
  const rawLeads = maxAction(actions, LEAD_ACTIONS);
  const rawMessages = maxAction(actions, MESSAGING_ACTIONS);

  if (isMessagingDestination(destinationType)) {
    return { leads: 0, messages: Math.max(rawMessages, rawLeads) };
  }

  if (rawMessages > 0 && rawLeads >= rawMessages) {
    return { leads: Math.max(rawLeads - rawMessages, 0), messages: rawMessages };
  }

  return { leads: rawLeads, messages: rawMessages };
}

/** Переразложить уже сохранённые leads/messages по destination. */
export function reclassifyStoredMetrics(
  leads: number,
  messages: number,
  destinationType: string | null | undefined,
): { leads: number; messages: number } {
  const l = Math.max(0, Number(leads) || 0);
  const m = Math.max(0, Number(messages) || 0);
  if (isMessagingDestination(destinationType)) {
    return { leads: 0, messages: Math.max(m, l) };
  }
  if (m > 0 && l >= m) return { leads: l - m, messages: m };
  return { leads: l, messages: m };
}

/** Лиды с сайта / pixel / формы (не WhatsApp, не клики). */
export function metaFormLeads(t: Pick<MetaTrafficTotals, "leads">): number {
  return Math.max(0, t.leads ?? 0);
}

/** Начатые переписки WhatsApp / Messenger. */
export function metaMessages(t: Pick<MetaTrafficTotals, "messages">): number {
  return Math.max(0, t.messages ?? 0);
}

/** Все конверсии Meta без кликов: формы + сообщения. */
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
