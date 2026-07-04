import {
  DollarSign,
  MessageCircle,
  Percent,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import type { SalesKpi } from "@/types/salesAnalytics";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

type Card = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  icon: typeof Users;
  tone?: "default" | "meta" | "crm" | "money";
};

function buildCards(kpi: SalesKpi, cabinetName?: string | null): Card[] {
  const cab = cabinetName ? ` · ${cabinetName}` : "";
  const metaSplit =
    kpi.adsMessages > 0 || kpi.adsFormLeads > 0
      ? `${fmt(kpi.adsMessages)} WhatsApp · ${fmt(kpi.adsFormLeads)} сайт`
      : "формы + WhatsApp из Meta";

  return [
    {
      key: "spend",
      label: "Расход",
      value: fmtMoney(kpi.spend),
      hint: `Meta Ads${cab}`,
      icon: Wallet,
      tone: "meta",
    },
    {
      key: "meta",
      label: "Лиды Meta",
      value: fmt(kpi.metaLeads),
      hint: metaSplit,
      icon: MessageCircle,
      tone: "meta",
    },
    {
      key: "cpl",
      label: "Стоимость лида",
      value: kpi.cpl > 0 ? fmtMoney(kpi.cpl) : "—",
      hint: "Расход ÷ лиды Meta",
      icon: Target,
      tone: "meta",
    },
    {
      key: "crm",
      label: "В CRM",
      value: fmt(kpi.crmLeads),
      hint: "С именем и телефоном",
      icon: Users,
      tone: "crm",
    },
    {
      key: "qual",
      label: "Квал",
      value: `${fmt(kpi.qualifiedYes)} · ${fmtPct(kpi.qualifiedRate)}`,
      hint: "Из лидов в CRM",
      icon: Percent,
      tone: "crm",
    },
    {
      key: "paid",
      label: "Оплатили",
      value: fmt(kpi.paidClients),
      hint: "Клиенты с оплатой",
      icon: UserCheck,
      tone: "crm",
    },
    {
      key: "cac",
      label: "CAC",
      value: kpi.cac > 0 ? fmtMoney(kpi.cac) : "—",
      hint: "Расход ÷ оплатившие",
      icon: DollarSign,
      tone: "money",
    },
    {
      key: "revenue",
      label: "Выручка",
      value: fmtMoney(kpi.revenue),
      hint: "Сумма оплат",
      icon: TrendingUp,
      tone: "money",
    },
    {
      key: "roas",
      label: "ROAS",
      value: kpi.spend > 0 ? fmtPct(kpi.roas) : "—",
      hint: "Выручка ÷ расход",
      icon: Percent,
      tone: "money",
    },
    {
      key: "avg",
      label: "Средний чек",
      value: kpi.avgCheck > 0 ? fmtMoney(kpi.avgCheck) : "—",
      hint: "Выручка ÷ оплаты",
      icon: DollarSign,
      tone: "money",
    },
  ];
}

const TONE_RING: Record<NonNullable<Card["tone"]>, string> = {
  default: "",
  meta: "border-sky-500/20",
  crm: "border-violet-500/20",
  money: "border-emerald-500/20",
};

type Props = {
  kpi: SalesKpi;
  cabinetName?: string | null;
  loading?: boolean;
};

export function SalesKpiCards({ kpi, cabinetName, loading }: Props) {
  const cards = buildCards(kpi, cabinetName);
  return (
    <div
      className={cn(
        "mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5",
        loading && "opacity-60",
      )}
    >
      {cards.map((c) => (
        <div
          key={c.key}
          className={cn(
            "rounded-xl border bg-card/80 p-4 shadow-sm",
            TONE_RING[c.tone ?? "default"] || "border-border/60",
          )}
        >
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <c.icon className="h-4 w-4 shrink-0" />
            <span className="text-xs font-medium leading-snug">{c.label}</span>
          </div>
          <div className="text-xl font-bold tabular-nums tracking-tight">{c.value}</div>
          {c.hint && <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}
