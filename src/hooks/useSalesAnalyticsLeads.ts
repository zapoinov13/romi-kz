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
  is_qualified: boolean | null;
  paid: boolean | null;
  amount: number | string | null;
  service_id: string | null;
  service: string | null;
  stage_id: string | null;
};

type StageRow = { id: string; key: string };

type OverlayRow = {
  id: string;
  lead_id: string | null;
  is_qualified: boolean | null;
  payment_status: string | null;
  service_id: string | null;
  amount: number | null;
};

function derivePaymentStatus(lead: LeadRow, stageKey: string | null): PaymentStatus | null {
  if (lead.paid) return "paid";
  if (stageKey === "rejected") return "unpaid";
  return null;
}

function deriveQualified(lead: LeadRow, stageKey: string | null): boolean | null {
  if (lead.is_qualified != null) return lead.is_qualified;
  if (!stageKey) return null;
  if (["in_progress", "invoice", "scheduled", "visit", "paid"].includes(stageKey)) return true;
  if (["rejected", "no_answer"].includes(stageKey)) return false;
  return null;
}

function mergeLead(
  lead: LeadRow,
  stageKey: string | null,
  overlay?: OverlayRow,
): SalesAnalyticsLead {
  const utm = lead.utm;
  const createdAt = lead.first_touch_at ?? lead.created_at;
  const fromCrm = {
    isQualified: deriveQualified(lead, stageKey),
    paymentStatus: derivePaymentStatus(lead, stageKey),
    serviceId: lead.service_id ?? null,
    amount: lead.amount != null && Number(lead.amount) > 0 ? Number(lead.amount) : null,
  };

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
    isQualified: fromCrm.isQualified ?? overlay?.is_qualified ?? null,
    paymentStatus: fromCrm.paymentStatus ?? (
      overlay?.payment_status === "paid" || overlay?.payment_status === "unpaid"
        ? (overlay.payment_status as PaymentStatus)
        : null
    ),
    serviceId: fromCrm.serviceId ?? overlay?.service_id ?? null,
    amount: fromCrm.amount ?? (overlay?.amount != null ? Number(overlay.amount) : null),
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

    let leadsQuery = supabase
      .from("leads")
      .select(
        "id, project_id, name, phone, meta_ad_id, utm, campaign, source, channel, cabinet_id, created_at, first_touch_at, is_qualified, paid, amount, service_id, service, stage_id",
      )
      .eq("is_personal", false)
      .or(`project_id.eq.${projectId},project_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(3000);

    const [leadsRes, overlayRes, stagesRes] = await Promise.all([
      leadsQuery,
      supabase
        .from("sales_analytics_leads")
        .select("id, lead_id, is_qualified, payment_status, service_id, amount")
        .eq("project_id", projectId),
      supabase.from("pipeline_stages").select("id, key"),
    ]);

    if (leadsRes.error) {
      setError(leadsRes.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const stageKeyById = new Map<string, string>();
    for (const s of (stagesRes.data ?? []) as StageRow[]) {
      stageKeyById.set(s.id, s.key);
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
      .map((lead) =>
        mergeLead(lead, stageKeyById.get(lead.stage_id ?? "") ?? null, overlayByLead.get(lead.id)),
      )
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
  useRealtimeTable("sales_service_catalog", () => void load(), !!projectId);

  return { rows, loading, error, overlayMissing, refresh: load };
}
