import {
  DollarSign,
  Percent,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import type { SalesKpi } from "@/types/salesAnalytics";
import { cn } from "@/lib/utils";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");
const fmtTenge = (n: number) => `${fmt(n)} ₸`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

type Card = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  icon: typeof Users;
};

function buildCards(kpi: SalesKpi, cabinetName?: string | null, rnpLeads?: number): Card[] {
  const spendHint = cabinetName ? `РНП · ${cabinetName}` : "из РНП";
  const leadsHint =
    rnpLeads != null && rnpLeads > kpi.totalLeads
      ? undefined
      : rnpLeads != null && rnpLeads > 0
        ? `Meta (РНП): ${rnpLeads}`
        : undefined;
  return [
    {
      key: "leads",
      label: "Всего лидов",
      value: fmt(kpi.totalLeads),
      hint: leadsHint,
      icon: Users,
    },
    { key: "spend", label: "Расходы", value: fmtTenge(kpi.spend), hint: spendHint, icon: Wallet },
    { key: "cpl", label: "Стоимость лида", value: fmtTenge(kpi.cpl), icon: Target },
    { key: "cac", label: "Стоимость клиента (CAC)", value: fmtTenge(kpi.cac), icon: DollarSign },
    {
      key: "qual",
      label: "Конверсия в качественный лид",
      value: fmtPct(kpi.qualifiedRate),
      icon: Percent,
    },
    { key: "paid", label: "Оплаченных клиентов", value: fmt(kpi.paidClients), icon: UserCheck },
    { key: "revenue", label: "Общая выручка", value: fmtTenge(kpi.revenue), icon: TrendingUp },
    { key: "roas", label: "ROAS", value: fmtPct(kpi.roas), hint: "Выручка ÷ Расходы", icon: Percent },
    {
      key: "avg",
      label: "Средний чек",
      value: fmtTenge(kpi.avgCheck),
      icon: DollarSign,
    },
  ];
}

type Props = {
  kpi: SalesKpi;
  cabinetName?: string | null;
  rnpLeads?: number;
  loading?: boolean;
};

export function SalesKpiCards({ kpi, cabinetName, rnpLeads, loading }: Props) {
  const cards = buildCards(kpi, cabinetName, rnpLeads);
  return (
    <div
      className={cn(
        "mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
        loading && "opacity-60",
      )}
    >
      {cards.map((c) => (
        <div
          key={c.key}
          className="rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm"
        >
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <c.icon className="h-4 w-4 shrink-0" />
            <span className="text-xs font-medium leading-snug">{c.label}</span>
          </div>
          <div className="text-xl font-bold tabular-nums tracking-tight">{c.value}</div>
          {c.hint && <div className="mt-1 text-[11px] text-muted-foreground">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}
