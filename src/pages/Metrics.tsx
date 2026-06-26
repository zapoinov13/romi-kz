import { useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Download,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PeriodPicker, monthRange } from "@/components/dashboard/PeriodPicker";
import { usePersonalCabinets } from "@/hooks/useCabinetsStore";
import { useMultiMetaInsights, type DailyInsightRow } from "@/hooks/useMetaInsights";
import { useFinancePlans, monthKey } from "@/hooks/useFinancePlan";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import type { ReportPeriodRange } from "@/hooks/useReportData";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { RnpManualCell } from "@/components/metrics/RnpManualCell";
import {
  RNP_COLUMNS,
  RNP_COLUMN_GROUPS,
  aggregateRnpSums,
  fmtTenge,
  type RnpColumnDef,
  type RnpColumnGroup,
} from "@/lib/rnpMetrics";

const MONTHS_GEN_RU = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];
const WEEKDAYS_RU = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const fmtNum = (n: number) => Math.round(n).toLocaleString("ru-RU");

const GROUP_ORDER: RnpColumnGroup[] = ["ads", "crm", "funnel", "money"];

const Dash = () => <span className="text-muted-foreground/40">—</span>;

function groupSpans(): { group: RnpColumnGroup; span: number }[] {
  return GROUP_ORDER.map((g) => ({
    group: g,
    span: RNP_COLUMNS.filter((c) => c.group === g).length,
  })).filter((x) => x.span > 0);
}

const Metrics = () => {
  const [period, setPeriod] = useState<ReportPeriodRange>(() => monthRange(new Date()));
  const monthCursor = period.from;
  const [cabinetId, setCabinetId] = useState<string>("all");
  const { cabinets } = usePersonalCabinets();
  const { activeId: projectId } = useProjectsStore();
  const [resyncing, setResyncing] = useState(false);

  const monthParam = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}`;

  const allActIds = useMemo(
    () => cabinets.map((c) => c.externalId).filter(Boolean),
    [cabinets],
  );

  const selectedCabinet = useMemo(
    () => (cabinetId === "all" ? null : cabinets.find((c) => c.id === cabinetId) ?? null),
    [cabinetId, cabinets],
  );

  const actIds = useMemo(() => {
    if (cabinetId === "all") return allActIds;
    return selectedCabinet?.externalId ? [selectedCabinet.externalId] : [];
  }, [cabinetId, allActIds, selectedCabinet]);

  const canEditManual = Boolean(selectedCabinet);

  const { data, loading, error, refresh } = useMultiMetaInsights(
    actIds,
    monthParam,
    actIds.length > 0,
  );

  const { getPlan } = useFinancePlans();
  const planSrc = getPlan(monthKey(monthCursor));
  const plan = planSrc
    ? {
        spend: planSrc.spend,
        leads: planSrc.leads,
        diagnostics: planSrc.visits,
        sales: planSrc.sales,
        revenue: planSrc.revenue,
      }
    : null;

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
      if (d && (d.spend > 0 || d.leads > 0)) n += 1;
    }
    return n;
  }, [monthDays, dailyByDate]);

  const monthProgress = Math.round((filledDays / daysInMonth) * 100);
  const totals = useMemo(
    () => aggregateRnpSums(data?.daily ?? []),
    [data],
  );

  const upsertManual = async (isoDate: string, patch: Record<string, number | null>) => {
    if (!selectedCabinet) return;
    try {
      const { data: existing } = await supabase
        .from("cabinet_daily_insights")
        .select("id")
        .eq("cabinet_id", selectedCabinet.id)
        .eq("date", isoDate)
        .maybeSingle();
      if (existing?.id) {
        const { error: updErr } = await supabase
          .from("cabinet_daily_insights")
          .update(patch)
          .eq("id", existing.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from("cabinet_daily_insights").insert({
          cabinet_id: selectedCabinet.id,
          external_id: selectedCabinet.externalId,
          project_id: projectId,
          date: isoDate,
          ...patch,
        });
        if (insErr) throw insErr;
      }
      toast.success("Сохранено");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    }
  };

  const renderCell = (def: RnpColumnDef, d: DailyInsightRow | undefined, iso: string) => {
    const v = def.pick(d);
    const empty = !Number.isFinite(v) || v <= 0;

    if (def.kind === "manual" && def.manualField && d) {
      const manualRaw =
        def.manualField === "manual_qualified"
          ? d.manualQualifiedRaw
          : def.manualField === "manual_diagnostics"
          ? d.manualDiagnosticsRaw
          : def.manualField === "manual_sales"
          ? d.manualSalesRaw
          : d.manualSalesRevenueRaw;
      const crmVal =
        def.manualField === "manual_qualified"
          ? d.crmQualified
          : def.manualField === "manual_diagnostics"
          ? d.crmDiagnostics
          : def.manualField === "manual_sales"
          ? d.crmSales
          : d.crmSalesRevenueOnly;

      return (
        <RnpManualCell
          value={v}
          crmValue={crmVal}
          manualRaw={manualRaw}
          format={def.format}
          title={def.label}
          allowDecimal={def.manualField === "manual_revenue"}
          disabled={!canEditManual}
          onSave={(val) => upsertManual(iso, { [def.manualField!]: val })}
        />
      );
    }

    return empty ? <Dash /> : <span className="tabular-nums">{def.format(v)}</span>;
  };

  const handleExportCsv = () => {
    const header = ["Дата", "День", ...RNP_COLUMNS.map((c) => c.short)];
    const rows = monthDays.map(({ day, iso, weekday }) => {
      const d = dailyByDate.get(iso);
      return [
        iso,
        `${String(day).padStart(2, "0")} ${weekday}`,
        ...RNP_COLUMNS.map((def) => {
          const v = def.pick(d);
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
    a.download = `rnp-${monthParam}${selectedCabinet ? `-${selectedCabinet.name}` : ""}.csv`;
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
      const body: Record<string, string> = { since, until };
      if (selectedCabinet) body.cabinet_id = selectedCabinet.id;
      const { error: invErr } = await supabase.functions.invoke("meta-daily-sync", { body });
      if (invErr) throw invErr;
      refresh();
      toast.success(`Синхронизация ${since} → ${until}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось синхронизировать");
    } finally {
      setResyncing(false);
    }
  };

  const pct = (fact: number, planVal: number | undefined) =>
    planVal && planVal > 0 ? Math.round((fact / planVal) * 100) : null;

  return (
    <PageContainer>
      <PageHeader
        icon={CalendarDays}
        title="РНП · Таблица показателей"
        description={`Данные Meta за ${filledDays} из ${daysInMonth} дней · ${data?.currency === "KZT" ? "в тенге" : data?.currency ?? "₸"}`}
        meta={
          <div className="hidden min-w-[180px] flex-col gap-1 sm:flex">
            <Progress value={monthProgress} className="h-2" />
            <span className="text-right text-[11px] font-medium text-success">
              {monthProgress}% месяца заполнено
            </span>
          </div>
        }
      />

      {/* KPI cards */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Wallet}
          label="Выручка"
          value={fmtTenge(totals.revenue)}
          sub={plan ? `${pct(totals.revenue, plan.revenue) ?? 0}% плана` : "план не задан"}
          tone="success"
        />
        <KpiCard
          icon={BarChart3}
          label="Расходы на рекламу"
          value={fmtTenge(totals.spend)}
          sub={`${fmtNum(totals.leads)} лидов · ${pct(totals.spend, plan?.spend) ?? "—"}% плана`}
          tone="primary"
        />
        <KpiCard
          icon={Target}
          label="Воронка"
          value={`КЭВ: ${fmtNum(totals.kev)}`}
          sub={`Продажи: ${totals.sales > 0 ? fmtNum(totals.sales) : "—"}`}
          tone="warning"
        />
        <KpiCard
          icon={TrendingUp}
          label="Эффективность"
          value={totals.leads > 0 ? fmtTenge(totals.spend / totals.leads) : "—"}
          sub={
            totals.sales > 0
              ? `CAC ${fmtTenge(totals.spend / totals.sales)} · конв. ${((totals.sales / totals.leads) * 100).toFixed(0)}%`
              : "CAC и конверсия — после продаж"
          }
          tone="muted"
        />
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <PeriodPicker range={period} onChange={setPeriod} />
          <Select value={cabinetId} onValueChange={setCabinetId}>
            <SelectTrigger className="h-11 min-w-[220px] rounded-xl border-border/60 bg-card/60">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Кабинет" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все кабинеты (сводка)</SelectItem>
              {cabinets.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="h-11 gap-2 rounded-xl"
            onClick={handleResync}
            disabled={resyncing || actIds.length === 0}
          >
            {resyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Синхронизация
          </Button>
          <Button variant="outline" className="h-11 gap-2 rounded-xl" onClick={handleExportCsv}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      {!canEditManual && (
        <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Выберите <b>один кабинет</b>, чтобы вручную вводить квал-лиды, КЭВ, продажи и оплаты. Данные хранятся отдельно по каждому кабинету.
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {/* Plan / Fact summary */}
      {plan && (
        <div className="mt-4 grid gap-2 rounded-xl border border-border/60 bg-card/40 p-4 sm:grid-cols-3">
          <PlanFactRow label="Расходы" plan={plan.spend} fact={totals.spend} format={fmtTenge} />
          <PlanFactRow label="Лиды" plan={plan.leads} fact={totals.leads} format={fmtNum} />
          <PlanFactRow label="КЭВ" plan={plan.diagnostics} fact={totals.kev} format={fmtNum} />
          <PlanFactRow label="Продажи" plan={plan.sales} fact={totals.sales} format={fmtNum} />
          <PlanFactRow label="Выручка" plan={plan.revenue} fact={totals.revenue} format={fmtTenge} />
        </div>
      )}

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border/60 bg-card/30">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/60">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 min-w-[88px] border-r border-border/40 bg-card/90 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur"
                >
                  Дата
                </th>
                {groupSpans().map(({ group, span }) => (
                  <th
                    key={group}
                    colSpan={span}
                    className={cn(
                      "border-r border-border/40 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider",
                      RNP_COLUMN_GROUPS[group].headerClass,
                    )}
                  >
                    {RNP_COLUMN_GROUPS[group].label}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border/60 bg-card/50">
                {RNP_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    title={col.help}
                    className="whitespace-nowrap px-2 py-2 text-right text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {col.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Fact total row */}
              <tr className="border-b border-border/60 bg-card/40 font-semibold">
                <td className="sticky left-0 z-10 border-r border-border/40 bg-card/80 px-3 py-2 backdrop-blur">
                  Итого
                </td>
                {RNP_COLUMNS.map((def) => {
                  const v = def.total(totals);
                  return (
                    <td key={def.key} className="px-2 py-2 text-right tabular-nums">
                      {v > 0 ? def.format(v) : <Dash />}
                    </td>
                  );
                })}
              </tr>

              {monthDays.map(({ day, iso, weekday }) => {
                const d = dailyByDate.get(iso);
                const isWeekend = weekday === "Сб" || weekday === "Вс";
                return (
                  <tr
                    key={iso}
                    className={cn(
                      "border-b border-border/20 transition-colors hover:bg-card/50",
                      isWeekend && "bg-muted/10",
                    )}
                  >
                    <td className="sticky left-0 z-10 border-r border-border/40 bg-background/90 px-3 py-2 backdrop-blur">
                      <span className="font-semibold tabular-nums">{String(day).padStart(2, "0")}</span>
                      <span className="ml-1 text-muted-foreground">{weekday}</span>
                    </td>
                    {RNP_COLUMNS.map((def) => (
                      <td key={def.key} className="px-2 py-1.5 text-right">
                        {renderCell(def, d, iso)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading && (
          <div className="flex items-center justify-center gap-2 border-t border-border/60 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Загрузка {MONTHS_GEN_RU[monthCursor.getMonth()]} {monthCursor.getFullYear()}…
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        <b>Реклама</b> — автоматически из Meta (затраты в ₸ после синхронизации).{" "}
        <b>Квал, КЭВ, продажи, оплаты</b> — вручную по выбранному кабинету, не смешиваются между проектами.
        Формулы CPL, CPQL, CP КЭВ, конверсия и CAC считаются на лету.
      </p>
    </PageContainer>
  );
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub: string;
  tone: "success" | "primary" | "warning" | "muted";
}) {
  const tones = {
    success: "border-success/30 bg-success/5",
    primary: "border-primary/30 bg-primary/5",
    warning: "border-warning/30 bg-warning/5",
    muted: "border-border/60 bg-card/40",
  };
  return (
    <div className={cn("rounded-2xl border p-4", tones[tone])}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function PlanFactRow({
  label,
  plan,
  fact,
  format,
}: {
  label: string;
  plan: number;
  fact: number;
  format: (n: number) => string;
}) {
  const p = plan > 0 ? Math.round((fact / plan) * 100) : null;
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        <span className="font-semibold">{format(fact)}</span>
        <span className="mx-1 text-muted-foreground/50">/</span>
        <span className="text-muted-foreground">{plan > 0 ? format(plan) : "—"}</span>
        {p != null && (
          <span className={cn("ml-2 font-medium", p >= 100 ? "text-success" : "text-warning")}>
            {p}%
          </span>
        )}
      </span>
    </div>
  );
}

export default Metrics;
