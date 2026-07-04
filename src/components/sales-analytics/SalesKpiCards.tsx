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
};

function MetaCards({ kpi, cabinetName }: { kpi: SalesKpi; cabinetName?: string | null }) {
  const cab = cabinetName ? ` · ${cabinetName}` : "";
  const cards: Card[] = [
    {
      key: "spend",
      label: "Расход",
      value: fmtMoney(kpi.spend),
      hint: `Только Meta Ads${cab}`,
      icon: Wallet,
    },
    {
      key: "meta",
      label: "Лиды Meta",
      value: fmt(kpi.metaLeads),
      hint:
        kpi.adsMessages > 0 || kpi.adsFormLeads > 0
          ? `${fmt(kpi.adsMessages)} WhatsApp · ${fmt(kpi.adsFormLeads)} сайт`
          : "WhatsApp + сайт из рекламы",
      icon: MessageCircle,
    },
    {
      key: "cpl",
      label: "Стоимость лида Meta",
      value: kpi.cpl > 0 ? fmtMoney(kpi.cpl) : "—",
      hint: "Расход ÷ лиды Meta",
      icon: Target,
    },
  ];

  return (
    <section className="mb-4">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
        Реклама · Meta
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <KpiCard key={c.key} card={c} className="border-sky-500/25" />
        ))}
      </div>
    </section>
  );
}

function CrmCards({ kpi }: { kpi: SalesKpi }) {
  const cards: Card[] = [
    {
      key: "crm",
      label: "Лиды CRM",
      value: fmt(kpi.crmLeads),
      hint: "С именем и телефоном в CRM",
      icon: Users,
    },
    {
      key: "qual",
      label: "Квал",
      value: `${fmt(kpi.qualifiedYes)} · ${fmtPct(kpi.qualifiedRate)}`,
      hint: "Только от лидов CRM",
      icon: Percent,
    },
    {
      key: "paid",
      label: "Оплатили",
      value: fmt(kpi.paidClients),
      hint: "Оплаты в CRM",
      icon: UserCheck,
    },
  ];

  return (
    <section className="mb-4">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
        CRM · заявки
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <KpiCard key={c.key} card={c} className="border-violet-500/25" />
        ))}
      </div>
    </section>
  );
}

function MoneyCards({ kpi }: { kpi: SalesKpi }) {
  const cards: Card[] = [
    {
      key: "cac",
      label: "CAC",
      value: kpi.cac > 0 ? fmtMoney(kpi.cac) : "—",
      hint: "Расход Meta ÷ оплаты CRM",
      icon: DollarSign,
    },
    {
      key: "revenue",
      label: "Выручка",
      value: fmtMoney(kpi.revenue),
      hint: "Сумма оплат в CRM",
      icon: TrendingUp,
    },
    {
      key: "roas",
      label: "ROAS",
      value: kpi.spend > 0 ? fmtPct(kpi.roas) : "—",
      hint: "Выручка CRM ÷ расход Meta",
      icon: Percent,
    },
    {
      key: "avg",
      label: "Средний чек",
      value: kpi.avgCheck > 0 ? fmtMoney(kpi.avgCheck) : "—",
      hint: "Выручка ÷ оплаты CRM",
      icon: DollarSign,
    },
  ];

  return (
    <section className="mb-6">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        Деньги
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <KpiCard key={c.key} card={c} className="border-emerald-500/25" />
        ))}
      </div>
    </section>
  );
}

function KpiCard({ card, className }: { card: Card; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card/80 p-4 shadow-sm", className)}>
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <card.icon className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium leading-snug">{card.label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums tracking-tight">{card.value}</div>
      {card.hint && (
        <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{card.hint}</div>
      )}
    </div>
  );
}

type Props = {
  kpi: SalesKpi;
  cabinetName?: string | null;
  loading?: boolean;
};

export function SalesKpiCards({ kpi, cabinetName, loading }: Props) {
  return (
    <div className={cn(loading && "opacity-60")}>
      <MetaCards kpi={kpi} cabinetName={cabinetName} />
      <CrmCards kpi={kpi} />
      <MoneyCards kpi={kpi} />
    </div>
  );
}
