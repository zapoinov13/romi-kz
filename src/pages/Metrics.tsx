import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Download,
  Loader2,
  Pencil,
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
import { useMultiMetaInsightsRange, type DailyInsightRow } from "@/hooks/useMetaInsights";
import { useFinancePlans, monthKey } from "@/hooks/useFinancePlan";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import type { ReportPeriodRange } from "@/hooks/useReportData";
import { dateRangeToIso, eachDayInRange, isoDateLocal } from "@/lib/periodRange";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { RnpEditableCell } from "@/components/metrics/RnpEditableCell";
import {
  RNP_COLUMNS,
  RNP_COLUMN_GROUPS,
  aggregateRnpSums,
  fmtTenge,
  type RnpColumnDef,
  type RnpColumnGroup,
} from "@/lib/rnpMetrics";
import { isManualOverrideActive } from "@/lib/cdiManualOverride";

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

function manualMeta(
  d: DailyInsightRow | undefined,
  field: NonNullable<RnpColumnDef["manualField"]>,
): { value: number; crm: number; raw: number | null } {
  if (!d) return { value: 0, crm: 0, raw: null };
  switch (field) {
    case "manual_qualified":
      return { value: d.qualified, crm: d.crmQualified, raw: d.manualQualifiedRaw };
    case "manual_diagnostics":
      return { value: d.diagnostics, crm: d.crmDiagnostics, raw: d.manualDiagnosticsRaw };
    case "manual_sales":
      return { value: d.sales, crm: d.crmSales, raw: d.manualSalesRaw };
    case "manual_revenue":
      return { value: d.salesRevenue, crm: d.crmSalesRevenueOnly, raw: d.manualSalesRevenueRaw };
  }
}

const Metrics = () => {
  const [period, setPeriod] = useState<ReportPeriodRange>(() => monthRange(new Date()));
  const { since, until } = dateRangeToIso(period);
  const { cabinets } = usePersonalCabinets();
  const [cabinetId, setCabinetId] = useState<string>("");
  const { activeId: projectId } = useProjectsStore();
  const [resyncing, setResyncing] = useState(false);

  useEffect(() => {
    if (!cabinetId && cabinets.length > 0) {
      setCabinetId(cabinets[0].id);
    }
  }, [cabinets, cabinetId]);

  const allActIds = useMemo(
    () => cabinets.map((c) => c.externalId).filter(Boolean),
    [cabinets],
  );

  const selectedCabinet = useMemo(
    () => cabinets.find((c) => c.id === cabinetId) ?? null,
    [cabinetId, cabinets],
  );

  const actIds = useMemo(() => {
    if (!selectedCabinet?.externalId) return allActIds;
    return [selectedCabinet.externalId];
  }, [selectedCabinet, allActIds]);

  const canEdit = Boolean(selectedCabinet);

  const { data, loading, error, refresh } = useMultiMetaInsightsRange(
    actIds,
    period,
    actIds.length > 0,
  );

  const { getPlan } = useFinancePlans();
  const planSrc = getPlan(monthKey(period.from));
  const plan = planSrc
    ? {
        spend: planSrc.spend,
        leads: planSrc.leads,
        diagnostics: planSrc.visits,
        sales: planSrc.sales,
        revenue: planSrc.revenue,
      }
    : null;

  const periodDays = useMemo(() => {
    return eachDayInRange(period).map((date) => ({
      day: date.getDate(),
      iso: isoDateLocal(date),
      weekday: WEEKDAYS_RU[date.getDay()],
    }));
  }, [period.from, period.to]);

  const daysInPeriod = periodDays.length;

  const dailyByDate = useMemo(() => {
    const m = new Map<string, DailyInsightRow>();
    for (const d of data?.daily ?? []) m.set(d.date, d);
    return m;
  }, [data]);

  const filledDays = useMemo(() => {
    let n = 0;
    for (const { iso } of periodDays) {
      const d = dailyByDate.get(iso);
      if (d && (d.spend > 0 || d.leads > 0 || d.qualified > 0 || d.diagnostics > 0)) n += 1;
    }
    return n;
  }, [periodDays, dailyByDate]);

  const monthProgress = daysInPeriod > 0 ? Math.round((filledDays / daysInPeriod) * 100) : 0;
  const totals = useMemo(() => aggregateRnpSums(data?.daily ?? []), [data]);

  const upsertField = async (isoDate: string, patch: Record<string, number | null>) => {
    if (!selectedCabinet) return;
    const normalized: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === "spend" || k === "leads") normalized[k] = v ?? 0;
      else normalized[k] = v;
    }
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
          .update(normalized as Record<string, never>)
          .eq("id", existing.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from("cabinet_daily_insights").insert({
          cabinet_id: selectedCabinet.id,
          external_id: selectedCabinet.externalId,
          project_id: projectId,
          date: isoDate,
          spend: 0,
          leads: 0,
          ...(normalized as Record<string, never>),
        });
        if (insErr) throw insErr;
      }
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
      throw e;
    }
  };

  const renderCell = (def: RnpColumnDef, d: DailyInsightRow | undefined, iso: string) => {
    if (def.kind === "formula") {
      const v = def.pick(d);
      const empty = !Number.isFinite(v) || v <= 0;
      return (
        <span
          className="block px-1.5 py-0.5 text-right tabular-nums text-muted-foreground"
          title={def.help}
        >
          {empty ? <Dash /> : def.format(v)}
        </span>
      );
    }

    if (def.kind === "direct" && def.directField) {
      const v = def.pick(d);
      return (
        <RnpEditableCell
          value={v}
          format={def.format}
          title={def.label}
          allowDecimal={def.directField === "spend"}
          disabled={!canEdit}
          source="meta"
          allowReset={false}
          onSave={async (val) => {
            await upsertField(iso, { [def.directField!]: val ?? 0 });
            toast.success("Сохранено");
          }}
        />
      );
    }

    if (def.kind === "manual" && def.manualField) {
      const { value, crm, raw } = manualMeta(d, def.manualField);
      return (
        <RnpEditableCell
          value={value}
          sourceValue={crm}
          format={def.format}
          title={def.label}
          allowDecimal={def.manualField === "manual_revenue"}
          disabled={!canEdit}
          source="crm"
          isManualOverride={isManualOverrideActive(raw)}
          onSave={async (val) => {
            await upsertField(iso, { [def.manualField!]: val });
            toast.success("Сохранено");
          }}
        />
      );
    }

    const v = def.pick(d);
    return v > 0 ? <span className="tabular-nums">{def.format(v)}</span> : <Dash />;
  };

  const handleExportCsv = () => {
    const header = ["Дата", "День", ...RNP_COLUMNS.map((c) => c.short)];
    const rows = periodDays.map(({ day, iso, weekday }) => {
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
    a.download = `rnp-${since}_${until}${selectedCabinet ? `-${selectedCabinet.name}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResync = async () => {
    if (!selectedCabinet) {
      toast.error("Выберите кабинет для синхронизации");
      return;
    }
    setResyncing(true);
    try {
      const { error: invErr } = await supabase.functions.invoke("meta-daily-sync", {
        body: { since, until, cabinet_id: selectedCabinet.id },
      });
      if (invErr) throw invErr;
      refresh();
      toast.success(`Meta: ${since} → ${until}`);
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
        description={
          selectedCabinet
            ? `${selectedCabinet.name} · ${filledDays}/${daysInPeriod} дн.`
            : "Выберите кабинет"
        }
        meta={
          <div className="hidden min-w-[180px] flex-col gap-1 sm:flex">
            <Progress value={monthProgress} className="h-2" />
            <span className="text-right text-[11px] font-medium text-primary">
              {monthProgress}% месяца
            </span>
          </div>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Wallet} label="Выручка" value={fmtTenge(totals.revenue)} sub={plan ? `${pct(totals.revenue, plan.revenue) ?? 0}% плана` : "—"} tone="success" />
        <KpiCard icon={BarChart3} label="Расходы" value={fmtTenge(totals.spend)} sub={`${fmtNum(totals.leads)} лидов`} tone="primary" />
        <KpiCard icon={Target} label="КЭВ" value={fmtNum(totals.kev)} sub={`Продажи: ${totals.sales || "—"}`} tone="warning" />
        <KpiCard icon={TrendingUp} label="CPL" value={totals.leads > 0 ? fmtTenge(totals.spend / totals.leads) : "—"} sub={totals.sales > 0 ? `CAC ${fmtTenge(totals.spend / totals.sales)}` : "—"} tone="muted" />
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <PeriodPicker range={period} onChange={setPeriod} showPresets showPresetBar />
          <Select value={cabinetId || undefined} onValueChange={setCabinetId}>
            <SelectTrigger className="h-11 min-w-[240px] rounded-lg border border-input bg-white">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Выберите кабинет" />
            </SelectTrigger>
            <SelectContent>
              {cabinets.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-11 gap-2 rounded-lg border-border bg-white" onClick={handleResync} disabled={resyncing || !canEdit}>
            {resyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Meta
          </Button>
          <Button variant="outline" className="h-11 gap-2 rounded-lg border-border bg-white" onClick={handleExportCsv}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white px-4 py-2.5 text-[11px] text-muted-foreground shadow-sm">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Pencil className="h-3.5 w-3.5 text-primary" />
            Клик по ячейке → ввод · Enter сохранить · Esc отмена
          </span>
          <span className="hidden h-4 w-px bg-border sm:block" />
          <span>Жёлтая рамка — ручная правка поверх CRM</span>
          <span className="hidden h-4 w-px bg-border sm:block" />
          <span>CPL, CPQL, CAC — считаются автоматически</span>
        </div>
      )}

      {!canEdit && cabinets.length === 0 && (
        <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Добавьте рекламный кабинет в разделе «Управление рекламой».
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {plan && (
        <div className="mt-4 grid gap-2 rounded-lg border border-border bg-white p-4 shadow-sm sm:grid-cols-3">
          <PlanFactRow label="Расходы" plan={plan.spend} fact={totals.spend} format={fmtTenge} />
          <PlanFactRow label="Лиды" plan={plan.leads} fact={totals.leads} format={fmtNum} />
          <PlanFactRow label="КЭВ" plan={plan.diagnostics} fact={totals.kev} format={fmtNum} />
          <PlanFactRow label="Продажи" plan={plan.sales} fact={totals.sales} format={fmtNum} />
          <PlanFactRow label="Выручка" plan={plan.revenue} fact={totals.revenue} format={fmtTenge} />
        </div>
      )}

      <div className="meta-table-wrap mt-6">
        <div className="max-h-[min(70vh,720px)] overflow-auto">
          <table className="w-full min-w-[1000px] border-collapse text-xs">
            <thead className="sticky top-0 z-30">
              <tr className="border-b border-border bg-secondary/40">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-40 min-w-[76px] border-r border-border bg-white px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
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
              <tr className="border-b border-border bg-white">
                {RNP_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    title={col.help}
                    className={cn(
                      "whitespace-nowrap px-1 py-2 text-right text-[9px] font-semibold uppercase tracking-wide",
                      col.kind === "formula" ? "text-muted-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {col.short}
                    {col.kind !== "formula" && (
                      <Pencil className="ml-0.5 inline h-2 w-2 text-primary/40" />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60 bg-muted/20 font-semibold">
                <td className="sticky left-0 z-20 border-r border-border/40 bg-muted/30 px-3 py-2 backdrop-blur">
                  Итого
                </td>
                {RNP_COLUMNS.map((def) => {
                  const v = def.total(totals);
                  return (
                    <td key={def.key} className="px-1 py-2 text-right tabular-nums">
                      {v > 0 ? def.format(v) : <Dash />}
                    </td>
                  );
                })}
              </tr>

              {periodDays.map(({ day, iso, weekday }) => {
                const d = dailyByDate.get(iso);
                const isWeekend = weekday === "Сб" || weekday === "Вс";
                const hasData = d && (d.spend > 0 || d.leads > 0 || d.qualified > 0 || d.diagnostics > 0 || d.sales > 0);
                return (
                  <tr
                    key={iso}
                    className={cn(
                      "border-b border-border/15 transition-colors",
                      isWeekend && "bg-muted/5",
                      hasData && "bg-card/20",
                      "hover:bg-primary/[0.03]",
                    )}
                  >
                    <td className="sticky left-0 z-20 border-r border-border/40 bg-background/95 px-3 py-1 backdrop-blur">
                      <span className="font-semibold tabular-nums">{String(day).padStart(2, "0")}</span>
                      <span className="ml-1 text-[10px] text-muted-foreground">{weekday}</span>
                    </td>
                    {RNP_COLUMNS.map((def) => (
                      <td key={def.key} className="px-0.5 py-0.5 align-middle">
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
            Загрузка…
          </div>
        )}
      </div>
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
    muted: "border-border bg-white",
  };
  return (
    <div className={cn("meta-card p-4", tones[tone])}>
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
