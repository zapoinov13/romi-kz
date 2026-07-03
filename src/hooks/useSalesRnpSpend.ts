import { useMemo } from "react";
import { usePersonalCabinets } from "@/hooks/useCabinetsStore";
import { useMetaInsightsRange } from "@/hooks/useMetaInsights";
import { resolveCabinetActId } from "@/lib/cabinetResolve";
import { metaConversionsTotal } from "@/lib/metaAdsMetrics";
import type { ReportPeriodRange } from "@/hooks/useReportData";

export function useSalesRnpSpend(range: ReportPeriodRange, cabinetId: string | null) {
  const { cabinets } = usePersonalCabinets();
  const cabinet = useMemo(
    () => cabinets.find((c) => c.id === cabinetId) ?? cabinets[0] ?? null,
    [cabinets, cabinetId],
  );
  const actId = cabinet ? resolveCabinetActId(cabinet) : null;
  const { data, loading, error } = useMetaInsightsRange(actId, range, !!actId);

  return {
    spend: data?.totals.spend ?? 0,
    rnpLeads: metaConversionsTotal({
      leads: data?.totals.leads ?? 0,
      messages: data?.totals.messages ?? 0,
    }),
    currency: data?.currency ?? "USD",
    cabinetName: cabinet?.name ?? null,
    actId,
    loading,
    error,
  };
}
