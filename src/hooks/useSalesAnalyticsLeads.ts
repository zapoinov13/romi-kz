import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import type { PaymentStatus, SalesAnalyticsLead } from "@/types/salesAnalytics";
import { buildSalesSourceLabel, filterByCabinet } from "@/lib/salesAnalyticsMetrics";
import {
  extractMetaAdIdFromLead,
  registerAdName,
  resolveLeadAdName,
  type AdNameMaps,
} from "@/lib/salesAdName";
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

export type SalesLeadUpdatePatch = Partial<
  Pick<SalesAnalyticsLead, "isQualified" | "paymentStatus" | "serviceId" | "amount">
>;

/** Кэш стадий пайплайна — почти не меняются. */
let stagesCache: { at: number; map: Map<string, string> } | null = null;
const STAGES_TTL_MS = 5 * 60_000;

function derivePaymentStatus(lead: LeadRow, stageKey: string | null): PaymentStatus | null {
  if (lead.paid === true) return "paid";
  if (lead.paid === false) return "unpaid";
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
  overlay: OverlayRow | undefined,
  maps: AdNameMaps,
): SalesAnalyticsLead {
  const utm = lead.utm;
  // Дата строки = created_at: по этому же полю фильтруется запрос и фильтры таблицы.
  const createdAt = lead.created_at;
  const fromCrm = {
    isQualified: deriveQualified(lead, stageKey),
    paymentStatus: derivePaymentStatus(lead, stageKey),
    serviceId: lead.service_id ?? null,
    amount: lead.amount != null && Number.isFinite(Number(lead.amount)) ? Number(lead.amount) : null,
  };

  const effectiveAdId = extractMetaAdIdFromLead(lead.meta_ad_id, utm, lead.phone);
  const adName = resolveLeadAdName(effectiveAdId, utm, maps);

  return {
    id: overlay?.id ?? lead.id,
    projectId: lead.project_id ?? "",
    leadId: lead.id,
    cabinetId: lead.cabinet_id,
    name: lead.name?.trim() || "—",
    phone: lead.phone?.trim() || "—",
    adName,
    sourceLabel: buildSalesSourceLabel({
      adName,
      metaAdId: effectiveAdId ?? lead.meta_ad_id,
      utm,
      campaign: lead.campaign,
      source: lead.source,
      channel: lead.channel,
    }),
    metaAdId: effectiveAdId ?? lead.meta_ad_id,
    utmContent: utm?.utm_content ?? utm?.content ?? null,
    channel: lead.channel,
    isQualified: fromCrm.isQualified ?? overlay?.is_qualified ?? null,
    paymentStatus:
      fromCrm.paymentStatus ??
      (overlay?.payment_status === "paid" || overlay?.payment_status === "unpaid"
        ? (overlay.payment_status as PaymentStatus)
        : null),
    serviceId: fromCrm.serviceId ?? overlay?.service_id ?? null,
    amount: fromCrm.amount ?? (overlay?.amount != null ? Number(overlay.amount) : null),
    createdAt,
  };
}

async function loadStageMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (stagesCache && now - stagesCache.at < STAGES_TTL_MS) {
    return stagesCache.map;
  }
  const { data } = await supabase.from("pipeline_stages").select("id, key");
  const map = new Map<string, string>();
  for (const s of (data ?? []) as StageRow[]) map.set(s.id, s.key);
  stagesCache = { at: now, map };
  return map;
}

async function loadAdNameMaps(projectId: string, adIds: string[]): Promise<AdNameMaps> {
  const creatives = new Map<string, string>();
  const campaigns = new Map<string, string>();
  const uniqueIds = [...new Set(adIds.map((id) => id.trim()).filter(Boolean))];

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    const [crRes, acRes] = await Promise.all([
      supabase.from("meta_creatives").select("ad_id, name, headline").in("ad_id", chunk),
      supabase.from("ad_campaigns").select("meta_ad_id, ad_name, headline").in("meta_ad_id", chunk),
    ]);
    for (const c of crRes.data ?? []) {
      const label = (c.name ?? "").trim() || (c.headline ?? "").trim();
      if (label) registerAdName(creatives, String(c.ad_id), label);
    }
    for (const ac of acRes.data ?? []) {
      const id = (ac.meta_ad_id ?? "").trim();
      const label = (ac.ad_name ?? "").trim() || (ac.headline ?? "").trim();
      if (id && label) registerAdName(campaigns, id, label);
    }
  }

  if (uniqueIds.length > 0) {
    const { data: allCr } = await supabase
      .from("meta_creatives")
      .select("ad_id, name, headline")
      .eq("project_id", projectId)
      .limit(2000);
    for (const c of allCr ?? []) {
      const label = (c.name ?? "").trim() || (c.headline ?? "").trim();
      if (label) registerAdName(creatives, String(c.ad_id), label);
    }
  }

  return { creatives, campaigns };
}

function collectAdIds(leads: LeadRow[]): string[] {
  const ids = new Set<string>();
  for (const l of leads) {
    const direct = (l.meta_ad_id ?? "").trim();
    if (direct) ids.add(direct);
    const utm = l.utm;
    const content = (utm?.utm_content ?? utm?.content ?? "").trim();
    if (content && /^\d{8,}$/.test(content)) ids.add(content);
  }
  return [...ids];
}

export function useSalesAnalyticsLeads(range: ReportPeriodRange, cabinetId: string | null) {
  const { activeId: projectId } = useProjectsStore();
  const [rows, setRows] = useState<SalesAnalyticsLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlayMissing, setOverlayMissing] = useState(false);
  const { since, until } = dateRangeToIso(range);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!projectId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);

    const sinceTs = `${since}T00:00:00`;
    const untilTs = `${until}T23:59:59.999`;

    let leadsQ = supabase
      .from("leads")
      .select(
        "id, project_id, name, phone, meta_ad_id, utm, campaign, source, channel, cabinet_id, created_at, first_touch_at, is_qualified, paid, amount, service_id, service, stage_id",
      )
      .eq("is_personal", false)
      .or(`project_id.eq.${projectId},project_id.is.null`)
      .gte("created_at", sinceTs)
      .lte("created_at", untilTs)
      .order("created_at", { ascending: false })
      .limit(1500);

    if (cabinetId) leadsQ = leadsQ.eq("cabinet_id", cabinetId);

    let overlayQ = supabase
      .from("sales_analytics_leads")
      .select("id, lead_id, is_qualified, payment_status, service_id, amount")
      .eq("project_id", projectId)
      .gte("created_at", sinceTs)
      .lte("created_at", untilTs)
      .limit(1500);

    if (cabinetId) overlayQ = overlayQ.eq("cabinet_id", cabinetId);

    const [leadsRes, overlayRes, stageKeyById] = await Promise.all([
      leadsQ,
      overlayQ,
      loadStageMap(),
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

    const leadRows = (leadsRes.data ?? []) as LeadRow[];
    const adNameMaps = await loadAdNameMaps(projectId, collectAdIds(leadRows));

    const merged = leadRows
      .map((lead) =>
        mergeLead(
          lead,
          stageKeyById.get(lead.stage_id ?? "") ?? null,
          overlayByLead.get(lead.id),
          adNameMaps,
        ),
      )
      .filter((lead) => filterByCabinet([lead], cabinetId).length > 0);

    setRows(merged);
    setLoading(false);
  }, [projectId, since, until, cabinetId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced realtime — не дёргаем полный reload на каждый чих
  useEffect(() => {
    if (!projectId) return;
    const schedule = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        void load();
      }, 400);
    };

    const channel = supabase
      .channel(`sales-analytics-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        schedule,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales_analytics_leads" },
        schedule,
      )
      .subscribe();

    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [projectId, load]);

  const updateLead = useCallback(
    async (leadId: string, patch: SalesLeadUpdatePatch) => {
      const leadPatch: {
        is_qualified?: boolean | null;
        paid?: boolean | null;
        service_id?: string | null;
        amount?: number | null;
      } = {};

      if ("isQualified" in patch) leadPatch.is_qualified = patch.isQualified ?? null;
      if ("paymentStatus" in patch) {
        if (patch.paymentStatus === "paid") leadPatch.paid = true;
        else if (patch.paymentStatus === "unpaid") leadPatch.paid = false;
        else leadPatch.paid = null;
      }
      if ("serviceId" in patch) leadPatch.service_id = patch.serviceId ?? null;
      if ("amount" in patch) {
        leadPatch.amount =
          patch.amount == null || !Number.isFinite(Number(patch.amount))
            ? null
            : Number(patch.amount);
      }

      if (Object.keys(leadPatch).length === 0) return;

      let snapshot: SalesAnalyticsLead[] = [];
      setRows((cur) => {
        snapshot = cur;
        return cur.map((r) => (r.leadId === leadId ? { ...r, ...patch } : r));
      });

      const { error: updErr } = await supabase
        .from("leads")
        .update(leadPatch)
        .eq("id", leadId);

      if (updErr) {
        setRows(snapshot);
        throw updErr;
      }
    },
    [],
  );

  return { rows, loading, error, overlayMissing, refresh: load, updateLead };
}
