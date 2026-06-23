import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Check,
  Download,
  Loader2,
  RefreshCw,
  Settings2,
  Target,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { PeriodPicker, monthRange } from "@/components/dashboard/PeriodPicker";
import { usePersonalCabinets } from "@/hooks/useCabinetsStore";
import { useMultiMetaInsights, type DailyInsightRow } from "@/hooks/useMetaInsights";
import { useFinancePlans, monthKey } from "@/hooks/useFinancePlan";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import { useIgFollowersDaily } from "@/hooks/useIgFollowersDaily";
import type { ReportPeriodRange } from "@/hooks/useReportData";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";

const MONTHS_GEN_RU = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

const WEEKDAYS_RU = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const formatNumber = (n: number) => Math.round(n).toLocaleString("ru-RU");
const formatTenge = (n: number) => `${formatNumber(n)} ₸`;
const formatDecimal = (n: number, digits = 2) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: digits });

// -------- Column registry --------

type MetricKey =
  | "spend"
  | "impressions"
  | "clicks"
  | "leads"
  | "cpl"
  | "cpm"
  | "cpc"
  | "ctr"
  | "new_followers";

interface MetricDef {
  key: MetricKey;
  label: string;
  short: string;
  help: string;
  source: "meta" | "instagram";
  /** Whether plan/% rows make sense for this metric. */
  hasPlan?: boolean;
  /** Per-day value extractor. */
  pick: (
    day: DailyInsightRow | undefined,
    ctx: { followers: number },
  ) => number;
  /** Totals extractor — for derived metrics computed from sums. */
  total: (
    sums: { spend: number; impressions: number; clicks: number; leads: number; followers: number },
  ) => number;
  /** Plan value extractor (only when hasPlan). */
  plan?: (plan: { spend: number; leads: number; cpl: number } | null) => number | null;
  format: (n: number) => string;
  /** Empty-cell predicate. */
  isEmpty?: (n: number) => boolean;
  /** Optional cell color. */
  accent?: "default" | "success" | "primary";
}

const ALL_METRICS: MetricDef[] = [
  {
    key: "spend",
    label: "Расходы",
    short: "Расходы",
    help: "Сумма расхода рекламного кабинета Meta (в ₸).",
    source: "meta",
    hasPlan: true,
    pick: (d) => d?.spend ?? 0,
    total: (s) => s.spend,
    plan: (p) => p?.spend ?? null,
    format: formatTenge,
  },
  {
    key: "impressions",
    label: "Показы",
    short: "Показы",
    help: "Количество показов креативов (impressions).",
    source: "meta",
    pick: (d) => d?.impressions ?? 0,
    total: (s) => s.impressions,
    format: formatNumber,
  },
  {
    key: "clicks",
    label: "Клики",
    short: "Клики",
    help: "Все клики по объявлениям.",
    source: "meta",
    pick: (d) => d?.clicks ?? 0,
    total: (s) => s.clicks,
    format: formatNumber,
  },
  {
    key: "leads",
    label: "Лиды",
    short: "Лиды",
    help: "Лиды по событиям атрибуции Meta (lead, messaging, on-site lead).",
    source: "meta",
    hasPlan: true,
    pick: (d) => d?.leads ?? 0,
    total: (s) => s.leads,
    plan: (p) => p?.leads ?? null,
    format: formatNumber,
    accent: "success",
  },
  {
    key: "cpl",
    label: "Стоимость заявки",
    short: "CPL",
    help: "Расходы ÷ лиды. Считается на лету по дневным суммам.",
    source: "meta",
    hasPlan: true,
    pick: (d) => (d && d.leads > 0 ? d.spend / d.leads : 0),
    total: (s) => (s.leads > 0 ? s.spend / s.leads : 0),
    plan: (p) => p?.cpl ?? null,
    format: formatTenge,
  },
  {
    key: "cpm",
    label: "Цена 1000 показов",
    short: "CPM",
    help: "Расходы ÷ показы × 1000.",
    source: "meta",
    pick: (d) => (d && d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0),
    total: (s) => (s.impressions > 0 ? (s.spend / s.impressions) * 1000 : 0),
    format: formatTenge,
  },
  {
    key: "cpc",
    label: "Цена клика",
    short: "CPC",
    help: "Расходы ÷ клики.",
    source: "meta",
    pick: (d) => (d && d.clicks > 0 ? d.spend / d.clicks : 0),
    total: (s) => (s.clicks > 0 ? s.spend / s.clicks : 0),
    format: formatTenge,
  },
  {
    key: "ctr",
    label: "Кликабельность",
    short: "CTR",
    help: "Клики ÷ показы × 100%.",
    source: "meta",
    pick: (d) => (d && d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0),
    total: (s) => (s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0),
    format: (n) => `${formatDecimal(n, 2)}%`,
  },
  {
    key: "new_followers",
    label: "Подписчики Instagram",
    short: "Подписчики",
    help: "Прирост подписчиков Instagram по дням (instagram_account_daily.new_followers). Привязка по проекту.",
    source: "instagram",
    pick: (_d, ctx) => ctx.followers,
    total: (s) => s.followers,
    format: formatNumber,
    accent: "primary",
  },
];

const METRICS_INDEX: Record<MetricKey, MetricDef> = Object.fromEntries(
  ALL_METRICS.map((m) => [m.key, m]),
) as Record<MetricKey, MetricDef>;

const DEFAULT_COLUMNS: MetricKey[] = [
  "spend",
  "impressions",
  "clicks",
  "leads",
  "cpl",
  "new_followers",
];

const STORAGE_KEY = "metrics.columns.v1";

function loadColumns(): MetricKey[] {
  if (typeof window === "undefined") return DEFAULT_COLUMNS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_COLUMNS;
    const valid = parsed.filter(
      (k): k is MetricKey => typeof k === "string" && k in METRICS_INDEX,
    );
    return valid.length > 0 ? valid : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

// -------- Components --------

const Cell = ({
  children,
  align = "right",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) => (
  <td
    className={cn(
      "whitespace-nowrap px-3 py-2 text-xs tabular-nums",
      align === "right" ? "text-right" : "text-left",
    )}
  >
    {children}
  </td>
);

const Dash = () => <span className="text-muted-foreground/40">—</span>;

interface ColumnPickerProps {
  selected: MetricKey[];
  onChange: (next: MetricKey[]) => void;
}

const ColumnPicker = ({ selected, onChange }: ColumnPickerProps) => {
  const selectedSet = new Set(selected);
  const toggle = (key: MetricKey) => {
    if (selectedSet.has(key)) {
      if (selected.length <= 1) return; // keep at least one
      onChange(selected.filter((k) => k !== key));
    } else {
      // preserve ALL_METRICS order
      const next = ALL_METRICS.map((m) => m.key).filter(
        (k) => selectedSet.has(k) || k === key,
      );
      onChange(next);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-12 gap-2 rounded-2xl border-border/60"
          title="Колонки таблицы"
        >
          <Settings2 className="h-4 w-4" />
          Колонки
          <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            {selected.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl border-border/70 p-3">
        <div className="flex items-center justify-between pb-2">
          <div className="text-sm font-semibold">Показывать колонки</div>
          <button
            type="button"
            className="text-[11px] font-medium text-primary hover:underline"
            onClick={() => onChange(DEFAULT_COLUMNS)}
          >
            Сбросить
          </button>
        </div>
        <div className="space-y-1">
          {ALL_METRICS.map((m) => {
            const active = selectedSet.has(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggle(m.key)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2 text-left transition-colors",
                  "hover:border-border/60 hover:bg-card/60",
                  active && "border-primary/30 bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 bg-background/40",
                  )}
                >
                  {active && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {m.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                        m.source === "instagram"
                          ? "bg-primary/15 text-primary"
                          : "bg-success/15 text-success",
                      )}
                    >
                      {m.source === "instagram" ? "IG" : "Meta"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {m.help}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

// -------- Page --------

const Metrics = () => {
  const [period, setPeriod] = useState<ReportPeriodRange>(() => monthRange(new Date()));
  const monthCursor = period.from;
  const [cabinetId, setCabinetId] = useState<string>("all");
  const { cabinets } = usePersonalCabinets();
  const { activeId: projectId } = useProjectsStore();
  const [resyncing, setResyncing] = useState(false);
  const [columns, setColumns] = useState<MetricKey[]>(() => loadColumns());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
    } catch {
      /* ignore */
    }
  }, [columns]);

  const monthParam = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}`;

  const allActIds = useMemo(
    () => cabinets.map((c) => c.externalId).filter(Boolean),
    [cabinets],
  );

  const actIds = useMemo(() => {
    if (cabinetId === "all") return allActIds;
    const cab = cabinets.find((c) => c.id === cabinetId);
    return cab?.externalId ? [cab.externalId] : [];
  }, [cabinetId, allActIds, cabinets]);

  const { data, loading, error, refresh } = useMultiMetaInsights(
    actIds,
    monthParam,
    actIds.length > 0,
  );

  const { byDate: followersByDate } = useIgFollowersDaily(projectId, monthParam);

  const { getPlan } = useFinancePlans();
  const planSrc = getPlan(monthKey(monthCursor));
  const plan = planSrc
    ? { spend: planSrc.spend, leads: planSrc.leads, cpl: planSrc.cpl }
    : null;

  // Days in selected month
  const daysInMonth = new Date(
    monthCursor.getFullYear(),
    monthCursor.getMonth() + 1,
    0,
  ).getDate();
  const monthDays = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day);
      const iso = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { day, iso, weekday: WEEKDAYS_RU[date.getDay()] };
    });
  }, [monthCursor, daysInMonth]);

  const dailyByDate = useMemo(() => {
    const m = new Map<string, DailyInsightRow>();
    for (const d of data?.daily ?? []) m.set(d.date, d);
    return m;
  }, [data]);

  const filledDays = useMemo(() => {
    let n = 0;
    for (const { iso } of monthDays) {
      const d = dailyByDate.get(iso);
      const f = followersByDate.get(iso) ?? 0;
      if ((d && (d.spend > 0 || d.leads > 0 || d.impressions > 0 || d.clicks > 0)) || f > 0) {
        n += 1;
      }
    }
    return n;
  }, [monthDays, dailyByDate, followersByDate]);
  const monthProgress = Math.round((filledDays / daysInMonth) * 100);

  const totalsSum = useMemo(() => {
    const sums = { spend: 0, impressions: 0, clicks: 0, leads: 0, followers: 0 };
    for (const { iso } of monthDays) {
      const d = dailyByDate.get(iso);
      if (d) {
        sums.spend += d.spend;
        sums.impressions += d.impressions;
        sums.clicks += d.clicks;
        sums.leads += d.leads;
      }
      sums.followers += followersByDate.get(iso) ?? 0;
    }
    return sums;
  }, [monthDays, dailyByDate, followersByDate]);

  const selectedDefs = useMemo(
    () => columns.map((k) => METRICS_INDEX[k]).filter(Boolean),
    [columns],
  );

  const handleExportCsv = () => {
    const header = ["Дата", "День", ...selectedDefs.map((d) => d.short)];
    const rows = monthDays.map(({ day, iso, weekday }) => {
      const d = dailyByDate.get(iso);
      const followers = followersByDate.get(iso) ?? 0;
      return [
        iso,
        `${String(day).padStart(2, "0")} ${weekday}`,
        ...selectedDefs.map((def) => {
          const v = def.pick(d, { followers });
          return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
        }),
      ];
    });
    const csv = [header, ...rows]
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? "");
            return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(";"),
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metrics-${monthParam}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResync = async () => {
    setResyncing(true);
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const since = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
      const monthEnd = lastDay < yesterday ? lastDay : yesterday;
      const until = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`;
      const targetCab = cabinetId !== "all" ? cabinets.find((c) => c.id === cabinetId) : null;
      const body: Record<string, string> = { since, until };
      if (targetCab) body.cabinet_id = targetCab.id;
      const { error: invErr } = await supabase.functions.invoke("meta-daily-sync", { body });
      if (invErr) throw invErr;
      refresh();
      toast.success(`Синхронизация ${since} → ${until} выполнена`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось синхронизировать");
    } finally {
      setResyncing(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        icon={CalendarDays}
        title="Таблица показателей"
        description={`${filledDays} дней с данными из ${daysInMonth}`}
        meta={
          <div className="hidden min-w-[180px] flex-col gap-1 sm:flex">
            <Progress value={monthProgress} className="h-2" />
            <span className="text-right text-[11px] font-medium text-success">
              {monthProgress}% месяца
            </span>
          </div>
        }
      />

      {/* Controls */}
      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <PeriodPicker range={period} onChange={setPeriod} />

          <Select value={cabinetId} onValueChange={setCabinetId}>
            <SelectTrigger className="h-12 min-w-[220px] rounded-2xl border-border/60 bg-card/60">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Все кабинеты" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все кабинеты</SelectItem>
              {cabinets.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ColumnPicker selected={columns} onChange={setColumns} />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {plan ? "План задан" : "План не задан"}
          </span>
          <Button
            variant="outline"
            className="h-12 gap-2 rounded-2xl border-border/60"
            onClick={handleResync}
            disabled={resyncing || actIds.length === 0}
            title="Перетянуть данные с 1 числа выбранного месяца"
          >
            {resyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Пересинхронизировать
          </Button>
          <Button
            variant="outline"
            className="h-12 gap-2 rounded-2xl border-border/60"
            onClick={handleExportCsv}
          >
            <Download className="h-4 w-4" />
            Экспорт CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Не удалось загрузить статистику</div>
            <div className="mt-0.5 text-xs opacity-90">{error}</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <colgroup>
              <col className="w-[110px]" />
              {selectedDefs.map((d) => (
                <col key={d.key} className="w-[120px]" />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-border/60 bg-card/60">
                <th className="sticky left-0 z-10 bg-card/80 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  Дата
                </th>
                {selectedDefs.map((d) => (
                  <th
                    key={d.key}
                    title={d.help}
                    className="whitespace-nowrap px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {d.short}
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[8px] font-bold",
                          d.source === "instagram"
                            ? "bg-primary/15 text-primary"
                            : "bg-success/15 text-success",
                        )}
                      >
                        {d.source === "instagram" ? "IG" : "Meta"}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* Plan row */}
              <tr className="border-b border-border/60">
                <td className="sticky left-0 z-[1] bg-card/60 px-3 py-2 backdrop-blur">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-success/10 text-success">
                      <Target className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-success">
                      План
                    </span>
                  </div>
                </td>
                {selectedDefs.map((d) => {
                  const v = d.hasPlan && d.plan ? d.plan(plan) : null;
                  return (
                    <Cell key={d.key}>
                      {v != null && v > 0 ? d.format(v) : <Dash />}
                    </Cell>
                  );
                })}
              </tr>

              {/* Fact row */}
              <tr className="border-b border-border/60 bg-card/30">
                <td className="sticky left-0 z-[1] bg-card/70 px-3 py-2 backdrop-blur">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
                      <BarChart3 className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Факт
                    </span>
                  </div>
                </td>
                {selectedDefs.map((d) => {
                  const v = d.total(totalsSum);
                  return (
                    <Cell key={d.key}>
                      <span
                        className={cn(
                          "font-bold",
                          d.accent === "success" && "text-success",
                          d.accent === "primary" && "text-primary",
                        )}
                      >
                        {v > 0 ? d.format(v) : <Dash />}
                      </span>
                    </Cell>
                  );
                })}
              </tr>

              {/* % completion */}
              <tr className="border-b border-border/60">
                <td className="sticky left-0 z-[1] bg-card/60 px-3 py-2 backdrop-blur">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-warning/15 text-warning">
                      <TrendingUp className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-warning">
                      % выполн.
                    </span>
                  </div>
                </td>
                {selectedDefs.map((d) => {
                  const fact = d.total(totalsSum);
                  const planV = d.hasPlan && d.plan ? d.plan(plan) : null;
                  if (!planV || planV <= 0) return <Cell key={d.key}><Dash /></Cell>;
                  const pct = Math.round((fact / planV) * 100);
                  return (
                    <Cell key={d.key}>
                      <span className="font-semibold text-warning">{pct}%</span>
                    </Cell>
                  );
                })}
              </tr>

              {/* Daily rows */}
              {monthDays.map(({ day, iso, weekday }) => {
                const d = dailyByDate.get(iso);
                const followers = followersByDate.get(iso) ?? 0;
                return (
                  <tr
                    key={iso}
                    className="border-b border-border/30 transition-colors hover:bg-card/40"
                  >
                    <td className="sticky left-0 z-[1] bg-background/80 px-3 py-2 text-xs backdrop-blur">
                      <span className="font-medium tabular-nums">
                        {String(day).padStart(2, "0")}
                      </span>
                      <span className="ml-1 text-muted-foreground">{weekday}</span>
                    </td>
                    {selectedDefs.map((def) => {
                      const v = def.pick(d, { followers });
                      const empty = !Number.isFinite(v) || v <= 0;
                      return (
                        <Cell key={def.key}>
                          {empty ? <Dash /> : def.format(v)}
                        </Cell>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Загружаем данные за {MONTHS_GEN_RU[monthCursor.getMonth()]} {monthCursor.getFullYear()}...
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Метрики Meta — из <code className="rounded bg-muted/40 px-1">cabinet_daily_insights</code>{" "}
        (расходы, показы, клики, лиды). Прирост подписчиков — из{" "}
        <code className="rounded bg-muted/40 px-1">instagram_account_daily</code> по активному
        проекту. Колонки настраиваются и запоминаются в браузере.
      </p>
    </PageContainer>
  );
};

export default Metrics;
