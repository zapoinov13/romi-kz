/**
 * Meta Ads: WhatsApp-сообщения и лиды с сайта — разные метрики.
 *
 * Meta часто пишет начатые переписки и в `lead` / `onsite_conversion.lead_grouped`.
 * Поэтому колонки заполняем по destination кампании, а не «как пришло из actions».
 */

export const LEAD_ACTIONS = [
  "lead",
  "leadgen.other",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "onsite_web_lead",
];

export const MESSAGING_ACTIONS = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.messaging_conversation_started_28d",
  "onsite_conversion.total_messaging_connection",
];

export const PURCHASE_ACTIONS = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
];

export type MetaAction = { action_type: string; value: string };

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

/** WhatsApp / Messenger / Instagram Direct */
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

/** Сайт / пиксель / лид-форма Meta (не мессенджер) */
export function isLeadDestination(dest: string | null | undefined): boolean {
  if (!dest) return true; // неизвестный destination — считаем лидами сайта/форм, не WA
  if (isMessagingDestination(dest)) return false;
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

export type SplitMetrics = { leads: number; messages: number };

/**
 * Раскладывает сырые actions Meta в колонки:
 * - messages = начатые переписки WhatsApp/Messenger
 * - leads    = лиды с сайта (pixel) / лид-формы Meta
 *
 * Клики сюда не входят.
 */
export function splitLeadsAndMessages(
  actions: MetaAction[] | undefined,
  destinationType: string | null | undefined,
): SplitMetrics {
  const rawLeads = maxAction(actions, LEAD_ACTIONS);
  const rawMessages = maxAction(actions, MESSAGING_ACTIONS);

  if (isMessagingDestination(destinationType)) {
    // Meta часто дублирует переписку в lead — в колонку лидов не кладём.
    return {
      leads: 0,
      messages: Math.max(rawMessages, rawLeads),
    };
  }

  // Сайт / формы / неизвестный destination
  // Если вдруг есть messaging action — не вычитаем из лидов только если destination не messaging.
  // На сайте messaging обычно 0; если Meta всё же отдал lead=messages — не задваиваем.
  if (rawMessages > 0 && rawLeads >= rawMessages) {
    return {
      leads: Math.max(rawLeads - rawMessages, 0),
      messages: rawMessages,
    };
  }

  return {
    leads: rawLeads,
    messages: rawMessages,
  };
}

/** Переразложить уже сохранённые leads/messages по destination (для backfill). */
export function reclassifyStoredMetrics(
  leads: number,
  messages: number,
  destinationType: string | null | undefined,
): SplitMetrics {
  const l = Math.max(0, Number(leads) || 0);
  const m = Math.max(0, Number(messages) || 0);

  if (isMessagingDestination(destinationType)) {
    return { leads: 0, messages: Math.max(m, l) };
  }

  // Старый баг: leads = formLeads + messages
  if (m > 0 && l >= m) {
    return { leads: l - m, messages: m };
  }
  return { leads: l, messages: m };
}
