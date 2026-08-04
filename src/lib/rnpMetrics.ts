import type { DailyInsightRow } from "@/hooks/useMetaInsights";
import { fmtMoney, fmtNum as fmtNumCore } from "@/lib/format";

export type RnpColumnGroup = "ads" | "crm" | "funnel" | "money";

export type RnpColumnKey =
  | "spend"
  | "clicks"
  | "messages"
  | "leads"
  | "cpl"
  | "cpwa"
  | "qualified"
  | "cpql"
  | "kev"
  | "cpkev"
  | "sales"
  | "revenue"
  | "conv_lead_sale"
  | "cac";

export interface RnpColumnDef {
  key: RnpColumnKey;
  group: RnpColumnGroup;
  label: string;
  short: string;
  help: string;
  kind: "meta" | "manual" | "formula" | "direct";
  manualField?:
    | "manual_qualified"
    | "manual_diagnostics"
    | "manual_sales"
    | "manual_revenue";
  directField?: "spend" | "leads" | "messages";
  format: (n: number) => string;
  pick: (d: DailyInsightRow | undefined) => number;
  total: (sums: RnpDaySums) => number;
}

export interface RnpDaySums {
  spend: number;
  clicks: number;
  messages: number;
  leads: number;
  qualified: number;
  kev: number;
  sales: number;
  revenue: number;
}

const fmtNum = fmtNumCore;
export const fmtTenge = fmtMoney;
const fmtPct = (n: number) =>
  `${n.toLocaleString("ru-RU", { maximumFractionDigits: 1, minimumFractionDigits: 0 })}%`;

function sumsFromDay(d: DailyInsightRow | undefined): RnpDaySums {
  if (!d) return { spend: 0, clicks: 0, messages: 0, leads: 0, qualified: 0, kev: 0, sales: 0, revenue: 0 };
  return {
    spend: d.spend,
    clicks: d.clicks,
    messages: d.messages,
    leads: d.leads,
    qualified: d.qualified,
    kev: d.diagnostics,
    sales: d.sales,
    revenue: d.salesRevenue,
  };
}

/** Все конверсии Meta за день: WhatsApp + лиды сайта (не клики). */
export function metaConvFromSums(s: Pick<RnpDaySums, "leads" | "messages">): number {
  return Math.max(0, s.leads) + Math.max(0, s.messages);
}

export const RNP_COLUMN_GROUPS: Record<
  RnpColumnGroup,
  { label: string; headerClass: string }
> = {
  ads: {
    label: "Реклама · Meta",
    headerClass: "bg-sky-500/10 text-sky-800 border-sky-500/20",
  },
  crm: {
    label: "CRM",
    headerClass: "bg-violet-500/10 text-violet-800 border-violet-500/20",
  },
  funnel: {
    label: "КЭВ",
    headerClass: "bg-amber-500/10 text-amber-900 border-amber-500/20",
  },
  money: {
    label: "Продажи",
    headerClass: "bg-emerald-500/10 text-emerald-900 border-emerald-500/20",
  },
};

export const RNP_COLUMNS: RnpColumnDef[] = [
  {
    key: "spend",
    group: "ads",
    label: "Расход Meta",
    short: "Расход",
    help: "Расход за день из Meta. Можно скорректировать вручную.",
    kind: "direct",
    directField: "spend",
    format: fmtTenge,
    pick: (d) => d?.spend ?? 0,
    total: (s) => s.spend,
  },
  {
    key: "clicks",
    group: "ads",
    label: "Клики",
    short: "Клики",
    help: "Клики по объявлению. Это не лиды и не сообщения.",
    kind: "meta",
    format: fmtNum,
    pick: (d) => d?.clicks ?? 0,
    total: (s) => s.clicks,
  },
  {
    key: "messages",
    group: "ads",
    label: "WhatsApp",
    short: "WA",
    help: "Кампании «Вовлечённость» → написать в WhatsApp. В Meta = «Начатая переписка». Значение из Meta, вручную не меняется.",
    kind: "meta",
    format: fmtNum,
    pick: (d) => d?.messages ?? 0,
    total: (s) => s.messages,
  },
  {
    key: "leads",
    group: "ads",
    label: "Лиды сайта",
    short: "Сайт",
    help: "Кампании с целью «Лиды» через пиксель / формы. В Meta = «Лиды с сайта». Значение из Meta, вручную не меняется.",
    kind: "meta",
    format: fmtNum,
    pick: (d) => d?.leads ?? 0,
    total: (s) => s.leads,
  },
  {
    key: "cpl",
    group: "ads",
    label: "CPL Meta",
    short: "CPL",
    help: "Расход ÷ (WhatsApp + лиды сайта). Клики не входят.",
    kind: "formula",
    format: fmtTenge,
    pick: (d) => {
      const s = sumsFromDay(d);
      const conv = metaConvFromSums(s);
      return conv > 0 ? s.spend / conv : 0;
    },
    total: (s) => {
      const conv = metaConvFromSums(s);
      return conv > 0 ? s.spend / conv : 0;
    },
  },
  {
    key: "cpwa",
    group: "ads",
    label: "Цена WhatsApp",
    short: "CP WA",
    help: "Расход ÷ сообщения WhatsApp.",
    kind: "formula",
    format: fmtTenge,
    pick: (d) => {
      const s = sumsFromDay(d);
      return s.messages > 0 ? s.spend / s.messages : 0;
    },
    total: (s) => (s.messages > 0 ? s.spend / s.messages : 0),
  },
  {
    key: "qualified",
    group: "crm",
    label: "Квал лиды",
    short: "Квал",
    help: "Квалифицированные лиды CRM — ввод вручную по дню.",
    kind: "manual",
    manualField: "manual_qualified",
    format: fmtNum,
    pick: (d) => d?.qualified ?? 0,
    total: (s) => s.qualified,
  },
  {
    key: "cpql",
    group: "crm",
    label: "Стоимость квал лида",
    short: "CPQL",
    help: "Расход ÷ квал лиды CRM.",
    kind: "formula",
    format: fmtTenge,
    pick: (d) => {
      const s = sumsFromDay(d);
      return s.qualified > 0 ? s.spend / s.qualified : 0;
    },
    total: (s) => (s.qualified > 0 ? s.spend / s.qualified : 0),
  },
  {
    key: "kev",
    group: "funnel",
    label: "Пришли на консультацию (КЭВ)",
    short: "КЭВ",
    help: "Консультации / диагностики — ввод вручную.",
    kind: "manual",
    manualField: "manual_diagnostics",
    format: fmtNum,
    pick: (d) => d?.diagnostics ?? 0,
    total: (s) => s.kev,
  },
  {
    key: "cpkev",
    group: "funnel",
    label: "Стоимость КЭВа",
    short: "CP КЭВ",
    help: "Расход ÷ КЭВ.",
    kind: "formula",
    format: fmtTenge,
    pick: (d) => {
      const s = sumsFromDay(d);
      return s.kev > 0 ? s.spend / s.kev : 0;
    },
    total: (s) => (s.kev > 0 ? s.spend / s.kev : 0),
  },
  {
    key: "sales",
    group: "money",
    label: "Продажи",
    short: "Продажи",
    help: "Количество продаж — ввод вручную.",
    kind: "manual",
    manualField: "manual_sales",
    format: fmtNum,
    pick: (d) => d?.sales ?? 0,
    total: (s) => s.sales,
  },
  {
    key: "revenue",
    group: "money",
    label: "Выручка",
    short: "Выручка",
    help: "Сумма оплат — ввод вручную.",
    kind: "manual",
    manualField: "manual_revenue",
    format: fmtTenge,
    pick: (d) => d?.salesRevenue ?? 0,
    total: (s) => s.revenue,
  },
  {
    key: "conv_lead_sale",
    group: "money",
    label: "Конверсия Meta → продажа",
    short: "Конв.",
    help: "Продажи ÷ (WhatsApp + лиды сайта) × 100%.",
    kind: "formula",
    format: fmtPct,
    pick: (d) => {
      const s = sumsFromDay(d);
      const conv = metaConvFromSums(s);
      return conv > 0 ? (s.sales / conv) * 100 : 0;
    },
    total: (s) => {
      const conv = metaConvFromSums(s);
      return conv > 0 ? (s.sales / conv) * 100 : 0;
    },
  },
  {
    key: "cac",
    group: "money",
    label: "Стоимость клиента",
    short: "CAC",
    help: "Расход ÷ продажи.",
    kind: "formula",
    format: fmtTenge,
    pick: (d) => {
      const s = sumsFromDay(d);
      return s.sales > 0 ? s.spend / s.sales : 0;
    },
    total: (s) => (s.sales > 0 ? s.spend / s.sales : 0),
  },
];

export function aggregateRnpSums(days: DailyInsightRow[]): RnpDaySums {
  const sums: RnpDaySums = {
    spend: 0, clicks: 0, messages: 0, leads: 0, qualified: 0, kev: 0, sales: 0, revenue: 0,
  };
  for (const d of days) {
    sums.spend += d.spend;
    sums.clicks += d.clicks;
    sums.messages += d.messages;
    sums.leads += d.leads;
    sums.qualified += d.qualified;
    sums.kev += d.diagnostics;
    sums.sales += d.sales;
    sums.revenue += d.salesRevenue;
  }
  return sums;
}
