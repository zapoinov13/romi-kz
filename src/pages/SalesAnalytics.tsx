import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Download, Info, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { currentMonthRange } from "@/components/dashboard/PeriodPicker";
import { SalesKpiCards } from "@/components/sales-analytics/SalesKpiCards";
import { SalesFiltersBar } from "@/components/sales-analytics/SalesFiltersBar";
import { SalesLeadsTable } from "@/components/sales-analytics/SalesLeadsTable";
import { SalesMonthNav } from "@/components/sales-analytics/SalesMonthNav";
import { TopCreativesBlock } from "@/components/sales-analytics/TopCreativesBlock";
import { TopServicesBlock } from "@/components/sales-analytics/TopServicesBlock";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePersonalCabinets } from "@/hooks/useCabinetsStore";
import { useSalesAnalyticsLeads } from "@/hooks/useSalesAnalyticsLeads";
import { useSalesRnpSpend } from "@/hooks/useSalesRnpSpend";
import { useSalesServices } from "@/hooks/useSalesServices";
import type { ReportPeriodRange } from "@/hooks/useReportData";
import { dateRangeToIso } from "@/lib/periodRange";
import {
  computeSalesKpi,
  computeTopCreatives,
  computeTopServices,
  filterDisplayableSalesLeads,
  filterSalesLeads,
} from "@/lib/salesAnalyticsMetrics";
import { exportSalesLeadsCsv } from "@/lib/salesAnalyticsExport";
import { EMPTY_SALES_FILTERS, type SalesLeadFilters } from "@/types/salesAnalytics";

function periodLabel(range: ReportPeriodRange): string {
  const same =
    range.from.getFullYear() === range.to.getFullYear() &&
    range.from.getMonth() === range.to.getMonth() &&
    range.from.getDate() === range.to.getDate();
  if (same) return format(range.from, "d MMMM yyyy", { locale: ru });
  return `${format(range.from, "d MMM", { locale: ru })} – ${format(range.to, "d MMM yyyy", { locale: ru })}`;
}

export default function SalesAnalytics() {
  const { cabinets } = usePersonalCabinets();
  const [cabinetId, setCabinetId] = useState("");
  const [range, setRange] = useState<ReportPeriodRange>(() => currentMonthRange());
  const [filters, setFilters] = useState<SalesLeadFilters>(EMPTY_SALES_FILTERS);

  useEffect(() => {
    if (!cabinetId && cabinets.length > 0) {
      setCabinetId(cabinets[0].id);
    }
  }, [cabinets, cabinetId]);

  const { since, until } = dateRangeToIso(range);
  const selectedCabinet = cabinets.find((c) => c.id === cabinetId) ?? null;

  useEffect(() => {
    setFilters(EMPTY_SALES_FILTERS);
  }, [since, until, cabinetId]);

  const {
    rows,
    loading: leadsLoading,
    error: leadsError,
    overlayMissing,
    updateLead,
  } = useSalesAnalyticsLeads(range, cabinetId || null);
  const {
    spend,
    adsFormLeads,
    adsMessages,
    metaLeads,
    cabinetName,
    loading: spendLoading,
    error: spendError,
  } = useSalesRnpSpend(range, cabinetId || null);
  const loading = leadsLoading || spendLoading;
  const error = leadsError ?? spendError;
  const { items: services, activeServices } = useSalesServices();

  const displayableRows = useMemo(() => filterDisplayableSalesLeads(rows), [rows]);
  const filtered = useMemo(
    () => filterSalesLeads(displayableRows, filters),
    [displayableRows, filters],
  );
  const kpi = useMemo(
    () =>
      computeSalesKpi(displayableRows, spend, {
        formLeads: adsFormLeads,
        messages: adsMessages,
        conversions: metaLeads,
      }),
    [displayableRows, spend, adsFormLeads, adsMessages, metaLeads],
  );
  const topCreatives = useMemo(() => computeTopCreatives(filtered), [filtered]);
  const topServices = useMemo(() => computeTopServices(filtered, services), [filtered, services]);

  const patchFilters = (patch: Partial<SalesLeadFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  };

  const handleExport = () => {
    const slug = selectedCabinet?.name?.replace(/\s+/g, "-") ?? since;
    exportSalesLeadsCsv(filtered, services, `analitika-prodazh-${slug}`);
    toast.success("Экспорт готов");
  };

  return (
    <PageContainer>
      <PageHeader
        icon={BarChart3}
        title="Аналитика продаж"
        description="Meta и CRM раздельно: реклама → заявки → квал → оплата → выручка"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SalesMonthNav range={range} onChange={setRange} />
            <Button variant="outline" className="h-10 gap-2 rounded-xl" asChild>
              <Link to="/settings?tab=services">Услуги</Link>
            </Button>
            <Button
              variant="outline"
              className="h-10 gap-2 rounded-xl"
              onClick={handleExport}
              disabled={filtered.length === 0}
            >
              <Download className="h-4 w-4" />
              Excel
            </Button>
          </div>
        }
      />

      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-gradient-to-r from-card via-card to-muted/20 px-4 py-3.5 shadow-sm">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Кабинет
          </span>
          <Select value={cabinetId || undefined} onValueChange={setCabinetId}>
            <SelectTrigger className="h-10 w-[min(100%,300px)] rounded-xl border-border/70 bg-background">
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
        <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Период{" "}
          <span className="font-semibold text-foreground">{periodLabel(range)}</span>
        </div>
      </div>

      {cabinets.length === 0 && (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-sm">
          Нет рекламных кабинетов.{" "}
          <Link to="/ads" className="font-semibold text-primary underline-offset-2 hover:underline">
            Подключите кабинет
          </Link>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3.5 text-sm text-destructive">
          {error}
        </div>
      )}

      {overlayMissing && (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-sm text-amber-900 dark:text-amber-200">
          Таблица синхронизации не найдена. Данные читаются из CRM.
        </div>
      )}

      <div className="mb-6 flex gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3.5 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
        <p>
          <span className="font-semibold text-foreground">Лиды Meta ≠ лиды CRM.</span> Из рекламы
          доходят не все. В таблице — только заявки с именем и телефоном. Квал, оплату, услугу и сумму
          можно менять прямо в строках.
        </p>
      </div>

      <SalesKpiCards kpi={kpi} cabinetName={cabinetName} loading={loading} />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <TopCreativesBlock items={topCreatives} />
        <TopServicesBlock items={topServices} />
      </div>

      {/* Table section */}
      <section className="mb-2">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/12 text-violet-600">
            <ListChecks className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Заявки в CRM</h2>
            <p className="text-[11px] text-muted-foreground">
              {selectedCabinet?.name ?? "Кабинет"} · редактирование сохраняется сразу
            </p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <span className="ml-auto rounded-full bg-muted px-3 py-1 text-xs font-semibold tabular-nums text-muted-foreground">
            {filtered.length}
            {filtered.length !== displayableRows.length
              ? ` / ${displayableRows.length}`
              : ""}{" "}
            строк
          </span>
        </div>

        <SalesFiltersBar
          filters={filters}
          onChange={patchFilters}
          onReset={() => setFilters(EMPTY_SALES_FILTERS)}
          services={activeServices}
          monthSince={since}
          monthUntil={until}
        />

        <SalesLeadsTable
          rows={filtered}
          services={activeServices}
          loading={loading}
          editable
          onUpdate={updateLead}
        />
      </section>
    </PageContainer>
  );
}
