import {
  DollarSign,
  MessageCircle,
  Percent,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { SalesKpi } from "@/types/salesAnalytics";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

type Tone = "sky" | "violet" | "emerald";

type Card = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
};

const TONE: Record<
  Tone,
  { section: string; iconBg: string; iconText: string; ring: string }
> = {
  sky: {
    section: "text-sky-700 dark:text-sky-300",
    iconBg: "bg-sky-500/12",
    iconText: "text-sky-600 dark:text-sky-400",
    ring: "hover:border-sky-500/40 hover:shadow-sky-500/5",
  },
  violet: {
    section: "text-violet-700 dark:text-violet-300",
    iconBg: "bg-violet-500/12",
    iconText: "text-violet-600 dark:text-violet-400",
    ring: "hover:border-violet-500/40 hover:shadow-violet-500/5",
  },
  emerald: {
    section: "text-emerald-700 dark:text-emerald-300",
    iconBg: "bg-emerald-500/12",
    iconText: "text-emerald-600 dark:text-emerald-400",
    ring: "hover:border-emerald-500/40 hover:shadow-emerald-500/5",
  },
};

function KpiCard({ card, tone }: { card: Card; tone: Tone }) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-card to-card/80 p-4 shadow-sm transition-all duration-200",
        t.ring,
        "hover:-translate-y-0.5 hover:shadow-md",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl", t.iconBg, t.iconText)}>
          <card.icon className="h-4 w-4" strokeWidth={2.25} />
        </span>
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {card.label}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">
        {card.value}
      </div>
      {card.hint && (
        <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground/90">{card.hint}</div>
      )}
    </div>
  );
}

function Section({
  title,
  tone,
  cols,
  cards,
}: {
  title: string;
  tone: Tone;
  cols: string;
  cards: Card[];
}) {
  return (
    <section className="mb-5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className={cn("h-1.5 w-1.5 rounded-full", tone === "sky" ? "bg-sky-500" : tone === "violet" ? "bg-violet-500" : "bg-emerald-500")} />
        <h3 className={cn("text-[11px] font-bold uppercase tracking-[0.08em]", TONE[tone].section)}>
          {title}
        </h3>
      </div>
      <div className={cn("grid gap-3", cols)}>
        {cards.map((c) => (
          <KpiCard key={c.key} card={c} tone={tone} />
        ))}
      </div>
    </section>
  );
}

type Props = {
  kpi: SalesKpi;
  cabinetName?: string | null;
  loading?: boolean;
};

export function SalesKpiCards({ kpi, cabinetName, loading }: Props) {
  const cab = cabinetName ? ` · ${cabinetName}` : "";

  return (
    <div className={cn(loading && "pointer-events-none opacity-55")}>
      <Section
        title="Реклама · Meta"
        tone="sky"
        cols="sm:grid-cols-3"
        cards={[
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
        ]}
      />
      <Section
        title="CRM · заявки"
        tone="violet"
        cols="sm:grid-cols-3"
        cards={[
          {
            key: "crm",
            label: "Лиды CRM",
            value: fmt(kpi.crmLeads),
            hint: "С именем и телефоном",
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
        ]}
      />
      <Section
        title="Деньги"
        tone="emerald"
        cols="sm:grid-cols-2 lg:grid-cols-4"
        cards={[
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
        ]}
      />
    </div>
  );
}
