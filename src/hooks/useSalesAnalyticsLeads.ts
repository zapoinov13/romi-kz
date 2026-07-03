import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import type { SalesAnalyticsLead } from "@/types/salesAnalytics";
import { monthBounds } from "@/lib/salesAnalyticsMetrics";

type Row = {
  id: string;
  project_id: string;
  lead_id: string | null;
  name: string;
  phone: string;
  source_label: string | null;
  meta_ad_id: string | null;
  utm_content: string | null;
  channel: string | null;
  is_qualified: boolean | null;
  payment_status: string | null;
  service_id: string | null;
  amount: number | null;
  created_at: string;
};

const toLead = (r: Row): SalesAnalyticsLead => ({
  id: r.id,
  projectId: r.project_id,
  leadId: r.lead_id,
  name: r.name,
  phone: r.phone,
  sourceLabel: r.source_label,
  metaAdId: r.meta_ad_id,
  utmContent: r.utm_content,
  channel: r.channel,
  isQualified: r.is_qualified,
  paymentStatus: r.payment_status === "paid" || r.payment_status === "unpaid" ? r.payment_status : null,
  serviceId: r.service_id,
  amount: r.amount != null ? Number(r.amount) : null,
  createdAt: r.created_at,
});

export function useSalesAnalyticsLeads(monthKey: string) {
  const { activeId: projectId } = useProjectsStore();
  const [rows, setRows] = useState<SalesAnalyticsLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) {
      setRows([]);
      return;
    }
    const { since, until } = monthBounds(monthKey);
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("sales_analytics_leads")
      .select(
        "id, project_id, lead_id, name, phone, source_label, meta_ad_id, utm_content, channel, is_qualified, payment_status, service_id, amount, created_at",
      )
      .eq("project_id", projectId)
      .gte("created_at", `${since}T00:00:00`)
      .lte("created_at", `${until}T23:59:59.999`)
      .order("created_at", { ascending: false });
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows((data as Row[] ?? []).map(toLead));
    }
    setLoading(false);
  }, [projectId, monthKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeTable("sales_analytics_leads", () => void load(), !!projectId);

  const updateLead = useCallback(
    async (id: string, patch: Partial<Pick<SalesAnalyticsLead, "isQualified" | "paymentStatus" | "serviceId" | "amount">>) => {
      const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ("isQualified" in patch) dbPatch.is_qualified = patch.isQualified;
      if ("paymentStatus" in patch) dbPatch.payment_status = patch.paymentStatus;
      if ("serviceId" in patch) dbPatch.service_id = patch.serviceId;
      if ("amount" in patch) dbPatch.amount = patch.amount;

      const { error: err } = await supabase.from("sales_analytics_leads").update(dbPatch).eq("id", id);
      if (err) throw new Error(err.message);

      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  return { rows, loading, error, refresh: load, updateLead };
}
