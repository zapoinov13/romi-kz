import type { DailyInsightRow } from "@/hooks/useMetaInsights";
import { fmtMoney, fmtNum as fmtNumCore } from "@/lib/format";

export type RnpColumnGroup = "ads" | "crm" | "funnel" | "money";

export type RnpColumnKey =
  | "spend"
  | "clicks"
  | "messages"
  | "leads"
  | "cpl"
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
  /** Auto from Meta, direct DB field, formula, or manual override field */
  kind: "meta" | "manual" | "formula" | "direct";
  manualField?:
    | "manual_qualified"
    | "manual_diagnostics"
    | "manual_sales"
    | "manual_revenue";
  /** Write straight to column (spend, leads) — overwritable, sync may refresh from Meta */
  directField?: "spend" | "leads";
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

export const RNP_COLUMN_GROUPS: Record<
  RnpColumnGroup,
  { label: string; headerClass: string }
> = {
  ads: {
    label: "Реклама",
    headerClass: "bg-primary/10 text-primary border-primary/20",
  },
  crm: {
    label: "CRM",
    headerClass: "bg-violet-50 text-violet-700 border-violet-200",
  },
  funnel: {
    label: "КЭВ",
    headerClass: "bg-amber-50 text-amber-800 border-amber-200",
  },
  money: {
    label: "Продажи",
    headerClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
};

export const RNP_COLUMNS: RnpColumnDef[] = [
  {
    key: "spend",
    group: "ads",
    label: "Потрачено на маркетинг",
    short: "Затраты",
    help: "Расход за день в $. Подтягивается из Meta, можно скорректировать вручную.",
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
    help: "Клики по объявлению. Это не лиды.",
    kind: "meta",
    format: fmtNum,
    pick: (d) => d?.clicks ?? 0,
    total: (s) => s.clicks,
  },
  {
    key: "messages",
    group: "ads",
    label: "Сообщения",
    short: "Сообщ.",
    help: "Начатые переписки WhatsApp / Messenger из Meta.",
    kind: "meta",
    format: fmtNum,
    pick: (d) => d?.messages ?? 0,
    total: (s) => s.messages,
  },
  {
    key: "leads",
    group: "ads",
    label: "Лиды (формы)",
    short: "Лиды",
    help: "Лид-формы и pixel lead из Meta. Без сообщений и кликов.",
    kind: "direct",
    directField: "leads",
    format: fmtNum,
    pick: (d) => d?.leads ?? 0,
    total: (s) => s.leads,
  },
  {
    key: "cpl",
    group: "ads",
    label: "Стоимость лида (формы)",
    short: "CPL",
    help: "Затраты ÷ лиды-формы. Сообщения считаются отдельно.",
    kind: "formula",
    format: fmtTenge,
    pick: (d) => {
      const s = sumsFromDay(d);
      return s.leads > 0 ? s.spend / s.leads : 0;
    },
    total: (s) => (s.leads > 0 ? s.spend / s.leads : 0),
  },
  {
    key: "qualified",
    group: "crm",
    label: "Квал лиды",
    short: "Квал",
    help: "Квалифицированные лиды — ввод вручную по дню.",
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
    help: "Затраты ÷ квал лиды.",
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
    help: "Затраты ÷ КЭВ.",
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
    label: "Продажи из таргета",
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
    label: "Сумма оплат по таргету",
    short: "Оплаты",
    help: "Выручка от продаж из таргета — ввод вручную.",
    kind: "manual",
    manualField: "manual_revenue",
    format: fmtTenge,
    pick: (d) => d?.salesRevenue ?? 0,
    total: (s) => s.revenue,
  },
  {
    key: "conv_lead_sale",
    group: "money",
    label: "Конверсия лид → продажа",
    short: "Конв.",
    help: "Продажи ÷ лиды × 100%.",
    kind: "formula",
    format: fmtPct,
    pick: (d) => {
      const s = sumsFromDay(d);
      return s.leads > 0 ? (s.sales / s.leads) * 100 : 0;
    },
    total: (s) => (s.leads > 0 ? (s.sales / s.leads) * 100 : 0),
  },
  {
    key: "cac",
    group: "money",
    label: "Стоимость клиента",
    short: "CAC",
    help: "Затраты ÷ продажи.",
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
  const sums: RnpDaySums = { spend: 0, clicks: 0, messages: 0, leads: 0, qualified: 0, kev: 0, sales: 0, revenue: 0 };
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
