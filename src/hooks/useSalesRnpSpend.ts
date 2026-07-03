import { useMemo } from "react";
import { usePersonalCabinets } from "@/hooks/useCabinetsStore";
import { useMetaInsights } from "@/hooks/useMetaInsights";
import { resolveCabinetActId } from "@/lib/cabinetResolve";
import { monthKeyFromDate } from "@/lib/salesAnalyticsMetrics";
import type { ReportPeriodRange } from "@/hooks/useReportData";

export function useSalesRnpSpend(range: ReportPeriodRange, cabinetId: string | null) {
  const { cabinets } = usePersonalCabinets();
  const cabinet = useMemo(
    () => cabinets.find((c) => c.id === cabinetId) ?? cabinets[0] ?? null,
    [cabinets, cabinetId],
  );
  const actId = cabinet ? resolveCabinetActId(cabinet) : null;
  const monthKey = monthKeyFromDate(range.from);
  const { data, loading, error } = useMetaInsights(actId, monthKey, !!actId);

  return {
    spend: data?.totals.spend ?? 0,
    rnpLeads: data?.totals.leads ?? 0,
    currency: data?.currency ?? "KZT",
    cabinetName: cabinet?.name ?? null,
    actId,
    loading,
    error,
  };
}
