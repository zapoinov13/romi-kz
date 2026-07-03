import { useEffect, useMemo, useState } from "react";
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
  const { cabinets } = usePersonalCabinets();
  const [cabinetId, setCabinetId] = useState("");
  const [range, setRange] = useState<ReportPeriodRange>(() => currentMonthRange());
  const [filters, setFilters] = useState<SalesLeadFilters>(EMPTY_SALES_FILTERS);
  const [servicesOpen, setServicesOpen] = useState(false);

  useEffect(() => {
    if (!cabinetId && cabinets.length > 0) {
      setCabinetId(cabinets[0].id);
    }
  }, [cabinets, cabinetId]);

  const monthKey = monthKeyFromDate(range.from);
  const { since, until } = monthBounds(monthKey);
  const selectedCabinet = cabinets.find((c) => c.id === cabinetId) ?? null;

  const { rows, loading, error, overlayMissing, updateLead } = useSalesAnalyticsLeads(
    monthKey,
    cabinetId || null,
  );
  const { spend, cabinetName, loading: spendLoading } = useSalesRnpSpend(
    range,
    cabinetId || null,
  );
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
    const slug = selectedCabinet?.name?.replace(/\s+/g, "-") ?? monthKey;
    exportSalesLeadsCsv(filtered, services, `analitika-prodazh-${slug}`);
    toast.success("Экспорт готов");
  };

  const handleUpdate = async (
    leadId: string,
    patch: Parameters<typeof updateLead>[1],
  ) => {
    try {
      await updateLead(leadId, patch);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    }
  };

  return (
    <PageContainer>
      <PageHeader
        icon={BarChart3}
        title="Аналитика продаж"
        description="Сквозная аналитика по кабинету: Meta Ads → лид → квалификация → продажа → выручка."
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

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">Кабинет</span>
        <Select value={cabinetId} onValueChange={setCabinetId}>
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
        {selectedCabinet && (
          <span className="text-xs text-muted-foreground">
            Лиды и расходы считаются только по этому кабинету
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {overlayMissing && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          Справочник аналитики не создан — лиды показываются из CRM. Для сохранения квала и оплат
          выполните SQL: <code className="text-xs">scripts/lovable-sales-analytics.sql</code>
        </div>
      )}

      <SalesKpiCards kpi={kpi} cabinetName={cabinetName} loading={loading || spendLoading} />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <TopCreativesBlock items={topCreatives} />
        <TopServicesBlock items={topServices} />
      </div>

      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <ListChecks className="h-4 w-4" />
        Заявки · {selectedCabinet?.name ?? monthKey}
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
