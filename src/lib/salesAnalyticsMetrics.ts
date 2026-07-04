import type { SalesAnalyticsLead, SalesKpi, SalesLeadFilters, TopCreativeRow, TopServiceRow } from "@/types/salesAnalytics";

type UtmLike = {
  utm_content?: string | null;
  utm_source?: string | null;
  content?: string | null;
} | null;

/** Похоже на числовой Meta ad id, а не на название. */
export function looksLikeMetaAdId(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  return /^\d{8,}$/.test(v) || /^act_\d+/i.test(v);
}

/**
 * Подпись источника для таблицы.
 * Приоритет: название объявления Meta → UTM (если не id) → кампания → канал.
 * Числовой ad_id показываем только если имени нет.
 */
export function buildSalesSourceLabel(input: {
  adName?: string | null;
  metaAdId?: string | null;
  utm?: UtmLike;
  campaign?: string | null;
  source?: string | null;
  channel?: string | null;
}): string {
  const utm = input.utm;
  const adName = input.adName?.trim();
  if (adName) return adName;

  const utmContent = utm?.utm_content?.trim() || utm?.content?.trim() || "";
  if (utmContent && !looksLikeMetaAdId(utmContent)) return utmContent;

  const campaign = input.campaign?.trim();
  if (campaign) return campaign;

  const source = input.source?.trim();
  if (source && !looksLikeMetaAdId(source)) return source;

  const channel = input.channel?.trim();
  if (channel) return channel;

  if (utmContent) return utmContent;
  return input.metaAdId?.trim() || "—";
}

function digits(s: string) {
  return s.replace(/\D/g, "");
}

export function filterSalesLeads(rows: SalesAnalyticsLead[], filters: SalesLeadFilters): SalesAnalyticsLead[] {
  return rows.filter((r) => {
    const day = r.createdAt.slice(0, 10);
    if (filters.dateFrom && day < filters.dateFrom) return false;
    if (filters.dateTo && day > filters.dateTo) return false;
    if (filters.qualified === "yes" && r.isQualified !== true) return false;
    if (filters.qualified === "no" && r.isQualified !== false) return false;
    if (filters.qualified === "unset" && r.isQualified !== null) return false;
    if (filters.payment === "paid" && r.paymentStatus !== "paid") return false;
    if (filters.payment === "unpaid" && r.paymentStatus !== "unpaid") return false;
    if (filters.payment === "unset" && r.paymentStatus !== null) return false;
    if (filters.serviceId && r.serviceId !== filters.serviceId) return false;
    if (filters.sourceQuery.trim()) {
      const q = filters.sourceQuery.trim().toLowerCase();
      const src = (r.sourceLabel ?? r.metaAdId ?? r.utmContent ?? "").toLowerCase();
      if (!src.includes(q)) return false;
    }
    if (filters.nameQuery.trim()) {
      if (!r.name.toLowerCase().includes(filters.nameQuery.trim().toLowerCase())) return false;
    }
    if (filters.phoneQuery.trim()) {
      const q = digits(filters.phoneQuery);
      const p = digits(r.phone);
      if (!p.includes(q)) return false;
    }
    return true;
  });
}

export type SalesMetaInput = {
  formLeads?: number;
  messages?: number;
  /** Если задано — используется как metaLeads (формы + WhatsApp). */
  conversions?: number;
};

/**
 * KPI без смешивания счётчиков:
 * - metaLeads / CPL — только реклама Meta
 * - crmLeads / квал / оплаты / выручка — только CRM
 * Числа независимы: из Meta в CRM доходят не все.
 */
export function computeSalesKpi(
  rows: SalesAnalyticsLead[],
  spend: number,
  meta?: number | SalesMetaInput,
): SalesKpi {
  const realRows = rows.filter((r) => !r.isSynthetic);
  const crmLeads = realRows.length;

  let adsFormLeads = 0;
  let adsMessages = 0;
  let metaLeads = 0;
  if (typeof meta === "number") {
    metaLeads = Math.max(0, meta);
  } else if (meta) {
    adsFormLeads = Math.max(0, meta.formLeads ?? 0);
    adsMessages = Math.max(0, meta.messages ?? 0);
    metaLeads = Math.max(0, meta.conversions ?? adsFormLeads + adsMessages);
  }

  const qualifiedYes = realRows.filter((r) => r.isQualified === true).length;
  const paid = realRows.filter((r) => r.paymentStatus === "paid");
  const paidClients = paid.length;
  const revenue = paid.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return {
    spend,
    metaLeads,
    adsMessages,
    adsFormLeads,
    crmLeads,
    cpl: metaLeads > 0 ? spend / metaLeads : 0,
    qualifiedYes,
    qualifiedRate: crmLeads > 0 ? (qualifiedYes / crmLeads) * 100 : 0,
    paidClients,
    cac: paidClients > 0 ? spend / paidClients : 0,
    revenue,
    roas: spend > 0 ? (revenue / spend) * 100 : 0,
    avgCheck: paidClients > 0 ? revenue / paidClients : 0,
  };
}

export function computeTopCreatives(rows: SalesAnalyticsLead[], limit = 3): TopCreativeRow[] {
  const map = new Map<string, TopCreativeRow>();
  for (const r of rows) {
    const key = r.metaAdId || r.utmContent || r.sourceLabel || "—";
    const label = r.sourceLabel || r.metaAdId || r.utmContent || "—";
    const cur = map.get(key) ?? { key, label, leads: 0, sales: 0, revenue: 0, conversion: 0 };
    cur.leads += 1;
    if (r.paymentStatus === "paid") {
      cur.sales += 1;
      cur.revenue += Number(r.amount) || 0;
    }
    map.set(key, cur);
  }
  return Array.from(map.values())
    .map((x) => ({ ...x, conversion: x.leads > 0 ? (x.sales / x.leads) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function computeTopServices(
  rows: SalesAnalyticsLead[],
  services: { id: string; name: string }[],
  limit = 3,
): TopServiceRow[] {
  const nameById = new Map(services.map((s) => [s.id, s.name]));
  const map = new Map<string, TopServiceRow>();
  for (const r of rows) {
    if (r.paymentStatus !== "paid" || !r.serviceId) continue;
    const name = nameById.get(r.serviceId) ?? "—";
    const cur = map.get(r.serviceId) ?? { serviceId: r.serviceId, name, sales: 0, revenue: 0, avgCheck: 0 };
    cur.sales += 1;
    cur.revenue += Number(r.amount) || 0;
    map.set(r.serviceId, cur);
  }
  return Array.from(map.values())
    .map((x) => ({ ...x, avgCheck: x.sales > 0 ? x.revenue / x.sales : 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function monthKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthBounds(monthKey: string): { since: string; until: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { since: `${y}-${mm}-01`, until: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function filterByCabinet(rows: SalesAnalyticsLead[], cabinetId: string | null): SalesAnalyticsLead[] {
  if (!cabinetId) return rows;
  // Только лиды этого кабинета (без «сирот» без cabinet_id — иначе раздувают каждый кабинет).
  return rows.filter((r) => r.cabinetId === cabinetId);
}

/** Лид показываем в таблице только с реальным именем и телефоном (из CRM). */
export function hasLeadContact(row: SalesAnalyticsLead): boolean {
  if (row.isSynthetic) return false;
  const name = row.name?.trim() ?? "";
  const phone = row.phone?.trim() ?? "";
  if (!name || name === "—" || /^лид meta/i.test(name)) return false;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return false;
  return true;
}

export function filterDisplayableSalesLeads(rows: SalesAnalyticsLead[]): SalesAnalyticsLead[] {
  return rows.filter(hasLeadContact);
}

export function inDateRange(iso: string, since: string, until: string): boolean {
  const day = iso.slice(0, 10);
  return day >= since && day <= until;
}

/** @deprecated используйте inDateRange */
export function inSalesMonth(iso: string, since: string, until: string): boolean {
  return inDateRange(iso, since, until);
}

/** @deprecated Синтетические строки больше не показываются в таблице — только KPI из РНП. */
export function appendMetaGapRows(
  rows: SalesAnalyticsLead[],
  rnpLeads: number,
  cabinetId: string,
  monthKey: string,
): SalesAnalyticsLead[] {
  const crmCount = rows.filter((r) => !r.isSynthetic).length;
  const gap = Math.max(0, rnpLeads - crmCount);
  if (gap === 0) return rows;
  const baseDay = `${monthKey}-15T12:00:00.000Z`;
  const synthetic: SalesAnalyticsLead[] = Array.from({ length: gap }, (_, i) => ({
    id: `meta-gap-${cabinetId}-${monthKey}-${i}`,
    projectId: rows[0]?.projectId ?? "",
    leadId: `meta-gap-${cabinetId}-${monthKey}-${i}`,
    cabinetId,
    name: `Лид Meta (${i + 1})`,
    phone: "—",
    sourceLabel: "Meta Ads · РНП",
    metaAdId: null,
    utmContent: null,
    channel: "meta",
    isQualified: null,
    paymentStatus: null,
    serviceId: null,
    amount: null,
    createdAt: baseDay,
    isSynthetic: true,
  }));
  return [...rows, ...synthetic];
}
