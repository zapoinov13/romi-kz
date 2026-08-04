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
  metaConvFromSums,
  type RnpColumnDef,
  type RnpColumnGroup,
} from "@/lib/rnpMetrics";
import { isManualOverrideActive } from "@/lib/cdiManualOverride";

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

  // Строго выбранный кабинет: раньше при кабинете без ID аккаунта таблица
  // показывала сумму по всем кабинетам, а правки писались в один - цифры не сходились.
  const actIds = useMemo(() => {
    if (selectedCabinet) return selectedCabinet.externalId ? [selectedCabinet.externalId] : [];
    return cabinetId ? [] : allActIds;
  }, [selectedCabinet, cabinetId, allActIds]);

  const canEdit = Boolean(selectedCabinet);

  const { data, loading, error, refresh } = useMultiMetaInsightsRange(
    actIds,
    period,
    actIds.length > 0,
  );
  const missingActId = Boolean(selectedCabinet && !selectedCabinet.externalId);

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
      if (
        d &&
        (d.spend > 0 ||
          d.leads > 0 ||
          d.messages > 0 ||
          d.clicks > 0 ||
          d.qualified > 0 ||
          d.diagnostics > 0 ||
          d.sales > 0)
      ) {
        n += 1;
      }
    }
    return n;
  }, [periodDays, dailyByDate]);

  const monthProgress = daysInPeriod > 0 ? Math.round((filledDays / daysInPeriod) * 100) : 0;
  const totals = useMemo(() => aggregateRnpSums(data?.daily ?? []), [data]);
  const metaConv = metaConvFromSums(totals);

  const upsertField = async (isoDate: string, patch: Record<string, number | null>) => {
    if (!selectedCabinet) return;
    const normalized: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === "spend" || k === "leads" || k === "messages") normalized[k] = v ?? 0;
      else normalized[k] = v;
    }
    try {
      const { data: existingRows } = await supabase
        .from("cabinet_daily_insights")
        .select("id")
        .eq("cabinet_id", selectedCabinet.id)
        .eq("date", isoDate)
        .order("id", { ascending: true })
        .limit(1);
      const existing = existingRows?.[0];
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
          messages: 0,
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
    return (
      <span className="block px-1.5 py-0.5 text-right tabular-nums" title={def.help}>
        {v > 0 ? def.format(v) : <Dash />}
      </span>
    );
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
    const totalRow = [
      "Итого",
      `${since} - ${until}`,
      ...RNP_COLUMNS.map((def) => {
        const v = def.total(totals);
        return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
      }),
    ];
    const csv = [header, totalRow, ...rows]
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
            ? `${selectedCabinet.name} · ${filledDays}/${daysInPeriod} дн. с данными`
            : "Выберите кабинет"
        }
        meta={
          <div className="hidden min-w-[180px] flex-col gap-1 sm:flex">
            <Progress value={monthProgress} className="h-2" />
            <span className="text-right text-[11px] font-medium text-primary">
              {monthProgress}% периода
            </span>
          </div>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Wallet}
          label="Выручка"
          value={fmtTenge(totals.revenue)}
          sub={plan ? `${pct(totals.revenue, plan.revenue) ?? 0}% плана` : "Оплаты CRM"}
          tone="success"
        />
        <KpiCard
          icon={BarChart3}
          label="Расход Meta"
          value={fmtTenge(totals.spend)}
          sub={`Клики ${fmtNum(totals.clicks)} · WA ${fmtNum(totals.messages)} · Сайт ${fmtNum(totals.leads)}`}
          tone="primary"
        />
        <KpiCard
          icon={Target}
          label="Конверсии Meta"
          value={fmtNum(metaConv)}
          sub={`${fmtNum(totals.messages)} WhatsApp · ${fmtNum(totals.leads)} сайт`}
          tone="warning"
        />
        <KpiCard
          icon={TrendingUp}
          label="CPL Meta"
          value={metaConv > 0 ? fmtTenge(totals.spend / metaConv) : "—"}
          sub={totals.sales > 0 ? `CAC ${fmtTenge(totals.spend / totals.sales)}` : "Расход ÷ (WA + сайт)"}
          tone="muted"
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border/70 bg-gradient-to-r from-card to-muted/20 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <PeriodPicker range={period} onChange={setPeriod} showPresets showPresetBar />
          <Select value={cabinetId || undefined} onValueChange={setCabinetId}>
            <SelectTrigger className="h-11 min-w-[240px] rounded-xl border-border/70 bg-background">
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
          <Button
            variant="outline"
            className="h-11 gap-2 rounded-xl"
            onClick={handleResync}
            disabled={resyncing || !canEdit}
          >
            {resyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Обновить Meta
          </Button>
          <Button variant="outline" className="h-11 gap-2 rounded-xl" onClick={handleExportCsv}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-sm text-muted-foreground">
        <strong className="text-foreground">Лиды и WhatsApp — разные цели кампании.</strong> Лиды =
        пиксель / цель «Лиды» (в Meta — «Лиды с сайта»). WhatsApp = вовлечённость → написать в
        WA (в Meta — «Начатая переписка»). Клики не лиды.
      </div>

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-2.5 text-[11px] text-muted-foreground shadow-sm">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Pencil className="h-3.5 w-3.5 text-primary" />
            Клик по ячейке → ввод · Enter сохранить · Esc отмена
          </span>
          <span className="hidden h-4 w-px bg-border sm:block" />
          <span>CPL, CP WA, CPQL, CAC - автоматически</span>
          <span className="hidden h-4 w-px bg-border sm:block" />
          <span>Клики, WA и Сайт приходят из Meta и не редактируются</span>
        </div>
      )}

      {missingActId && (
        <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          У кабинета «{selectedCabinet?.name}» не указан ID рекламного аккаунта - данные Meta не
          загружаются. Укажите ID в разделе «Управление рекламой».
        </div>
      )}

      {!canEdit && cabinets.length === 0 && (
        <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Добавьте рекламный кабинет в разделе «Управление рекламой».
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {plan && (
        <div className="mt-4 grid gap-2 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:grid-cols-3">
          <PlanFactRow label="Расходы" plan={plan.spend} fact={totals.spend} format={fmtTenge} />
          <PlanFactRow label="Лиды Meta" plan={plan.leads} fact={metaConv} format={fmtNum} />
          <PlanFactRow label="КЭВ" plan={plan.diagnostics} fact={totals.kev} format={fmtNum} />
          <PlanFactRow label="Продажи" plan={plan.sales} fact={totals.sales} format={fmtNum} />
          <PlanFactRow label="Выручка" plan={plan.revenue} fact={totals.revenue} format={fmtTenge} />
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className="max-h-[min(70vh,720px)] overflow-auto">
          <table className="w-full min-w-[1100px] border-collapse text-xs">
            <thead className="sticky top-0 z-30">
              <tr className="border-b border-border/60 bg-muted/50">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-40 min-w-[80px] border-r border-border/50 bg-muted/80 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur"
                >
                  Дата
                </th>
                {groupSpans().map(({ group, span }) => (
                  <th
                    key={group}
                    colSpan={span}
                    className={cn(
                      "border-r border-border/30 px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider",
                      RNP_COLUMN_GROUPS[group].headerClass,
                    )}
                  >
                    {RNP_COLUMN_GROUPS[group].label}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border/60 bg-card/95 backdrop-blur">
                {RNP_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    title={col.help}
                    className={cn(
                      "whitespace-nowrap px-1.5 py-2 text-right text-[9px] font-semibold uppercase tracking-wide",
                      col.kind === "formula" ? "text-muted-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {col.short}
                    {(col.kind === "manual" || col.kind === "direct") && (
                      <Pencil className="ml-0.5 inline h-2 w-2 text-primary/40" />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50 bg-muted/30 font-semibold">
                <td className="sticky left-0 z-20 border-r border-border/40 bg-muted/50 px-3 py-2.5 backdrop-blur">
                  Итого
                </td>
                {RNP_COLUMNS.map((def) => {
                  const v = def.total(totals);
                  return (
                    <td key={def.key} className="px-1.5 py-2.5 text-right tabular-nums">
                      {v > 0 ? def.format(v) : <Dash />}
                    </td>
                  );
                })}
              </tr>

              {periodDays.map(({ day, iso, weekday }, idx) => {
                const d = dailyByDate.get(iso);
                const isWeekend = weekday === "Сб" || weekday === "Вс";
                const hasData =
                  d &&
                  (d.spend > 0 ||
                    d.leads > 0 ||
                    d.messages > 0 ||
                    d.clicks > 0 ||
                    d.qualified > 0 ||
                    d.diagnostics > 0 ||
                    d.sales > 0);
                return (
                  <tr
                    key={iso}
                    className={cn(
                      "border-b border-border/20 transition-colors",
                      isWeekend && "bg-muted/10",
                      idx % 2 === 1 && !isWeekend && "bg-muted/5",
                      hasData && "bg-card/30",
                      "hover:bg-primary/[0.04]",
                    )}
                  >
                    <td className="sticky left-0 z-20 border-r border-border/40 bg-background/95 px-3 py-1.5 backdrop-blur">
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
    success: "border-emerald-500/25 bg-gradient-to-b from-emerald-500/10 to-card",
    primary: "border-sky-500/25 bg-gradient-to-b from-sky-500/10 to-card",
    warning: "border-amber-500/25 bg-gradient-to-b from-amber-500/10 to-card",
    muted: "border-border/70 bg-gradient-to-b from-card to-card/80",
  };
  const iconTone = {
    success: "bg-emerald-500/12 text-emerald-600",
    primary: "bg-sky-500/12 text-sky-600",
    warning: "bg-amber-500/12 text-amber-700",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md", tones[tone])}>
      <div className="mb-3 flex items-center gap-2">
        <span className={cn("grid h-8 w-8 place-items-center rounded-xl", iconTone[tone])}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{sub}</div>
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
