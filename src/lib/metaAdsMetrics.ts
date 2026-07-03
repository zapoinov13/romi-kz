/** Meta Ads: клики, сообщения и лиды-формы — разные метрики. */

export type MetaTrafficTotals = {
  spend: number;
  clicks: number;
  leads: number;
  messages: number;
};

/** Лиды через форму / pixel (не сообщения, не клики). */
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
