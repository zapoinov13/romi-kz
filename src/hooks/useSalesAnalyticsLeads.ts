import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import type { PaymentStatus, SalesAnalyticsLead } from "@/types/salesAnalytics";
import {
  buildSalesSourceLabel,
  filterByCabinet,
  inDateRange,
} from "@/lib/salesAnalyticsMetrics";
import type { ReportPeriodRange } from "@/hooks/useReportData";
import { dateRangeToIso } from "@/lib/periodRange";

type LeadRow = {
  id: string;
  project_id: string | null;
  name: string | null;
  phone: string | null;
  meta_ad_id: string | null;
  utm: Record<string, string> | null;
  campaign: string | null;
  source: string | null;
  channel: string | null;
  cabinet_id: string | null;
  created_at: string;
  first_touch_at: string | null;
};

type OverlayRow = {
  id: string;
  lead_id: string | null;
  is_qualified: boolean | null;
  payment_status: string | null;
  service_id: string | null;
  amount: number | null;
};

function mergeLead(lead: LeadRow, overlay?: OverlayRow): SalesAnalyticsLead {
  const utm = lead.utm;
  const createdAt = lead.first_touch_at ?? lead.created_at;
  return {
    id: overlay?.id ?? lead.id,
    projectId: lead.project_id ?? "",
    leadId: lead.id,
    cabinetId: lead.cabinet_id,
    name: lead.name?.trim() || "—",
    phone: lead.phone?.trim() || "—",
    sourceLabel: buildSalesSourceLabel({
      metaAdId: lead.meta_ad_id,
      utm,
      campaign: lead.campaign,
      source: lead.source,
      channel: lead.channel,
    }),
    metaAdId: lead.meta_ad_id,
    utmContent: utm?.utm_content ?? utm?.content ?? null,
    channel: lead.channel,
    isQualified: overlay?.is_qualified ?? null,
    paymentStatus:
      overlay?.payment_status === "paid" || overlay?.payment_status === "unpaid"
        ? (overlay.payment_status as PaymentStatus)
        : null,
    serviceId: overlay?.service_id ?? null,
    amount: overlay?.amount != null ? Number(overlay.amount) : null,
    createdAt,
  };
}

export function useSalesAnalyticsLeads(range: ReportPeriodRange, cabinetId: string | null) {
  const { activeId: projectId } = useProjectsStore();
  const [rows, setRows] = useState<SalesAnalyticsLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlayMissing, setOverlayMissing] = useState(false);
  const { since, until } = dateRangeToIso(range);

  const load = useCallback(async () => {
    if (!projectId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);

    // Как в CRM: project_id ИЛИ null (старые лиды без привязки)
    let leadsQuery = supabase
      .from("leads")
      .select(
        "id, project_id, name, phone, meta_ad_id, utm, campaign, source, channel, cabinet_id, created_at, first_touch_at",
      )
      .eq("is_personal", false)
      .or(`project_id.eq.${projectId},project_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(3000);

    const [leadsRes, overlayRes] = await Promise.all([
      leadsQuery,
      supabase
        .from("sales_analytics_leads")
        .select("id, lead_id, is_qualified, payment_status, service_id, amount")
        .eq("project_id", projectId),
    ]);

    if (leadsRes.error) {
      setError(leadsRes.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const overlayByLead = new Map<string, OverlayRow>();
    if (overlayRes.error) {
      const msg = overlayRes.error.message ?? "";
      setOverlayMissing(/sales_analytics_leads|schema cache|PGRST205/i.test(msg));
    } else {
      setOverlayMissing(false);
      for (const row of (overlayRes.data ?? []) as OverlayRow[]) {
        if (row.lead_id) overlayByLead.set(row.lead_id, row);
      }
    }

    const merged = ((leadsRes.data ?? []) as LeadRow[])
      .map((lead) => mergeLead(lead, overlayByLead.get(lead.id)))
      .filter((lead) => inDateRange(lead.createdAt, since, until))
      .filter((lead) => filterByCabinet([lead], cabinetId).length > 0);

    setRows(merged);
    setLoading(false);
  }, [projectId, since, until, cabinetId]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeTable("leads", () => void load(), !!projectId);
  useRealtimeTable("sales_analytics_leads", () => void load(), !!projectId);

  const updateLead = useCallback(
    async (
      leadId: string,
      patch: Partial<Pick<SalesAnalyticsLead, "isQualified" | "paymentStatus" | "serviceId" | "amount">>,
    ) => {
      if (leadId.startsWith("meta-gap-")) {
        throw new Error("Это лид из Meta (РНП) — дождитесь синхронизации в CRM или создайте вручную");
      }
      const current = rows.find((r) => r.leadId === leadId);
      if (!current || !projectId) throw new Error("Лид не найден");

      const dbPatch: Record<string, unknown> = {
        project_id: projectId,
        lead_id: leadId,
        cabinet_id: current.cabinetId,
        name: current.name,
        phone: current.phone,
        source_label: current.sourceLabel,
        meta_ad_id: current.metaAdId,
        utm_content: current.utmContent,
        channel: current.channel,
        created_at: current.createdAt,
        updated_at: new Date().toISOString(),
      };
      if ("isQualified" in patch) dbPatch.is_qualified = patch.isQualified;
      if ("paymentStatus" in patch) dbPatch.payment_status = patch.paymentStatus;
      if ("serviceId" in patch) dbPatch.service_id = patch.serviceId;
      if ("amount" in patch) dbPatch.amount = patch.amount;

      const { data, error: err } = await supabase
        .from("sales_analytics_leads")
        .upsert(dbPatch as never, { onConflict: "lead_id" })
        .select("id")
        .single();
      if (err) throw new Error(err.message);

      setRows((prev) =>
        prev.map((r) =>
          r.leadId === leadId ? { ...r, ...patch, id: (data?.id as string) ?? r.id } : r,
        ),
      );
    },
    [projectId, rows],
  );

  return { rows, loading, error, overlayMissing, refresh: load, updateLead };
}
