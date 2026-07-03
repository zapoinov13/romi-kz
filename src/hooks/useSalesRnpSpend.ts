import { useMemo } from "react";
import { usePersonalCabinets } from "@/hooks/useCabinetsStore";
import { useMultiMetaInsights } from "@/hooks/useMetaInsights";
import { monthKeyFromDate } from "@/lib/salesAnalyticsMetrics";
import type { ReportPeriodRange } from "@/hooks/useReportData";

export function useSalesRnpSpend(range: ReportPeriodRange) {
  const { cabinets } = usePersonalCabinets();
  const actIds = useMemo(
    () =>
      cabinets
        .map((c) => c.adAccountId || c.externalId)
        .filter((id): id is string => !!id),
    [cabinets],
  );
  const monthKey = monthKeyFromDate(range.from);
  const { data, loading, error } = useMultiMetaInsights(actIds, monthKey, actIds.length > 0);

  return {
    spend: data?.totals.spend ?? 0,
    currency: data?.totals ? data.currency : "KZT",
    loading,
    error,
  };
}
