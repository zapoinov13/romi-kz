import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Download, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { format } from "date-fns";
import { ru } from "date-fns/locale";

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

  const { rows, loading: leadsLoading, error: leadsError, overlayMissing } = useSalesAnalyticsLeads(
    range,
    cabinetId || null,
  );
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

  const gap = Math.max(0, metaLeads - displayableRows.length);

  return (
    <PageContainer>
      <PageHeader
        icon={BarChart3}
        title="Аналитика продаж"
        description="Meta Ads → лид в CRM → квал → оплата → выручка. По одному кабинету и периоду."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SalesMonthNav range={range} onChange={setRange} />
            <Button variant="outline" className="gap-2" asChild>
              <Link to="/settings?tab=services">Справочник услуг</Link>
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleExport}
              disabled={filtered.length === 0}
            >
              <Download className="h-4 w-4" />
              Excel
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">Кабинет</span>
        <Select value={cabinetId || undefined} onValueChange={setCabinetId}>
          <SelectTrigger className="h-10 w-[min(100%,320px)]">
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
        <span className="text-xs text-muted-foreground">
          Период: <span className="font-medium text-foreground">{periodLabel(range)}</span>
        </span>
      </div>

      {cabinets.length === 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Нет рекламных кабинетов.{" "}
          <Link to="/ads" className="font-medium text-primary underline-offset-2 hover:underline">
            Подключите кабинет
          </Link>
          , чтобы считать расходы и лиды Meta.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {overlayMissing && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          Таблица синхронизации не найдена. Данные читаются из CRM; выполните{" "}
          <code className="text-xs">scripts/lovable-sales-analytics.sql</code> в Supabase при необходимости.
        </div>
      )}

      <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <strong className="text-foreground">Как считаем:</strong> расход и лиды Meta — из рекламы
        (WhatsApp + сайт). Квал, оплаты и выручка — только по заявкам в CRM с именем и телефоном.
        Редактирование — в{" "}
        <Link to="/crm" className="font-medium text-primary underline-offset-2 hover:underline">
          CRM
        </Link>
        .
      </div>

      {gap > 0 && (
        <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-950 dark:text-sky-100">
          Meta за период: <strong>{metaLeads}</strong> (
          {adsMessages} WhatsApp · {adsFormLeads} сайт). В CRM с контактами:{" "}
          <strong>{displayableRows.length}</strong>. Ещё <strong>{gap}</strong> появятся в таблице,
          когда придут имя и телефон.
        </div>
      )}

      <SalesKpiCards kpi={kpi} cabinetName={cabinetName} loading={loading} />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <TopCreativesBlock items={topCreatives} />
        <TopServicesBlock items={topServices} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">
        <ListChecks className="h-4 w-4" />
        Заявки в CRM
        {selectedCabinet && (
          <span className="text-foreground">· {selectedCabinet.name}</span>
        )}
        {(loading) && <Loader2 className="h-4 w-4 animate-spin" />}
        <span className="ml-auto tabular-nums">
          {filtered.length}
          {filtered.length !== displayableRows.length
            ? ` из ${displayableRows.length}`
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
        editable={false}
        onUpdate={async () => {}}
      />
    </PageContainer>
  );
}
