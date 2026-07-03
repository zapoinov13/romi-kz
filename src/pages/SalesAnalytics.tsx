import { useMemo, useState } from "react";
import { BarChart3, Download, ListChecks, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { currentMonthRange } from "@/components/dashboard/PeriodPicker";
import { SalesKpiCards } from "@/components/sales-analytics/SalesKpiCards";
import { SalesFiltersBar } from "@/components/sales-analytics/SalesFiltersBar";
import { SalesLeadsTable } from "@/components/sales-analytics/SalesLeadsTable";
import { SalesMonthNav } from "@/components/sales-analytics/SalesMonthNav";
import { ServicesCatalogDialog } from "@/components/sales-analytics/ServicesCatalogDialog";
import { TopCreativesBlock } from "@/components/sales-analytics/TopCreativesBlock";
import { TopServicesBlock } from "@/components/sales-analytics/TopServicesBlock";
import { Button } from "@/components/ui/button";
import { useSalesAnalyticsLeads } from "@/hooks/useSalesAnalyticsLeads";
import { useSalesRnpSpend } from "@/hooks/useSalesRnpSpend";
import { useSalesServices } from "@/hooks/useSalesServices";
import type { ReportPeriodRange } from "@/hooks/useReportData";
import {
  computeSalesKpi,
  computeTopCreatives,
  computeTopServices,
  filterSalesLeads,
  monthBounds,
  monthKeyFromDate,
} from "@/lib/salesAnalyticsMetrics";
import { exportSalesLeadsCsv } from "@/lib/salesAnalyticsExport";
import { EMPTY_SALES_FILTERS, type SalesLeadFilters } from "@/types/salesAnalytics";

export default function SalesAnalytics() {
  const [range, setRange] = useState<ReportPeriodRange>(() => currentMonthRange());
  const [filters, setFilters] = useState<SalesLeadFilters>(EMPTY_SALES_FILTERS);
  const [servicesOpen, setServicesOpen] = useState(false);

  const monthKey = monthKeyFromDate(range.from);
  const { since, until } = monthBounds(monthKey);

  const { rows, loading, error, updateLead } = useSalesAnalyticsLeads(monthKey);
  const { spend, loading: spendLoading } = useSalesRnpSpend(range);
  const {
    items: services,
    activeServices,
    loading: servicesLoading,
    add: addService,
    update: updateService,
    remove: removeService,
  } = useSalesServices();

  const filtered = useMemo(() => filterSalesLeads(rows, filters), [rows, filters]);
  const kpi = useMemo(() => computeSalesKpi(filtered, spend), [filtered, spend]);
  const topCreatives = useMemo(() => computeTopCreatives(filtered), [filtered]);
  const topServices = useMemo(() => computeTopServices(filtered, services), [filtered, services]);

  const patchFilters = (patch: Partial<SalesLeadFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  };

  const handleExport = () => {
    exportSalesLeadsCsv(filtered, services, `analitika-prodazh-${monthKey}`);
    toast.success("Экспорт готов");
  };

  const handleUpdate = async (
    id: string,
    patch: Parameters<typeof updateLead>[1],
  ) => {
    try {
      await updateLead(id, patch);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    }
  };

  return (
    <PageContainer>
      <PageHeader
        icon={BarChart3}
        title="Аналитика продаж"
        description="Сквозная аналитика: Meta Ads → лид → квалификация → продажа → выручка."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SalesMonthNav range={range} onChange={setRange} />
            <Button variant="outline" className="gap-2" onClick={() => setServicesOpen(true)}>
              <Settings2 className="h-4 w-4" />
              Услуги
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Excel
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error.includes("sales_analytics")
            ? "Примените миграцию в Supabase (scripts/lovable-sales-analytics.sql) и обновите страницу."
            : error}
        </div>
      )}

      <SalesKpiCards kpi={kpi} loading={loading || spendLoading} />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <TopCreativesBlock items={topCreatives} />
        <TopServicesBlock items={topServices} />
      </div>

      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <ListChecks className="h-4 w-4" />
        Заявки за {monthKey}
        {(loading || spendLoading) && <Loader2 className="h-4 w-4 animate-spin" />}
        <span className="ml-auto tabular-nums">{filtered.length} строк</span>
      </div>

      <SalesFiltersBar
        filters={filters}
        onChange={patchFilters}
        services={activeServices}
        monthSince={since}
        monthUntil={until}
      />

      <SalesLeadsTable
        rows={filtered}
        services={activeServices}
        loading={loading}
        onUpdate={handleUpdate}
      />

      <ServicesCatalogDialog
        open={servicesOpen}
        onOpenChange={setServicesOpen}
        items={services}
        loading={servicesLoading}
        onAdd={addService}
        onUpdate={updateService}
        onRemove={removeService}
      />
    </PageContainer>
  );
}
