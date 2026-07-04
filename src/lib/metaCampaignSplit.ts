import { supabase } from "@/integrations/supabase/client";
import { reclassifyStoredMetrics } from "@/lib/metaAdsMetrics";

export type DayLeadSplit = { leads: number; messages: number };

export type DayAdsMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  messages: number;
};

type CampaignMeta = {
  destination_type: string | null;
  objective: string | null;
  name: string | null;
};

async function loadCampaignMeta(campaignIds: string[]): Promise<Map<string, CampaignMeta>> {
  const metaByCampaign = new Map<string, CampaignMeta>();
  if (campaignIds.length === 0) return metaByCampaign;
  const { data: camps } = await supabase
    .from("meta_campaigns")
    .select("campaign_id, destination_type, objective, name")
    .in("campaign_id", campaignIds);
  for (const c of camps ?? []) {
    metaByCampaign.set(String(c.campaign_id), {
      destination_type: (c as { destination_type?: string | null }).destination_type ?? null,
      objective: (c as { objective?: string | null }).objective ?? null,
      name: (c as { name?: string | null }).name ?? null,
    });
  }
  return metaByCampaign;
}

function dayKey(date: unknown): string {
  return String(date ?? "").slice(0, 10);
}

/**
 * Полные дневные метрики из meta_campaign_daily
 * (spend/clicks/impressions + лиды/WA с переразложением).
 */
export async function fetchCampaignDayMetrics(
  cabinetIds: string[],
  since: string,
  until: string,
  projectId?: string | null,
): Promise<Map<string, DayAdsMetrics>> {
  const byDate = new Map<string, DayAdsMetrics>();
  if (cabinetIds.length === 0) return byDate;

  let mcdQ = supabase
    .from("meta_campaign_daily")
    .select("campaign_id, cabinet_id, date, spend, impressions, clicks, leads, messages")
    .in("cabinet_id", cabinetIds)
    .gte("date", since)
    .lte("date", until);
  if (projectId) mcdQ = mcdQ.eq("project_id", projectId);
  let { data: mcd, error } = await mcdQ;
  if (error) return byDate;

  // Фоллбэк: строки без project_id / другой проект
  if ((!mcd || mcd.length === 0) && projectId) {
    const r2 = await supabase
      .from("meta_campaign_daily")
      .select("campaign_id, cabinet_id, date, spend, impressions, clicks, leads, messages")
      .in("cabinet_id", cabinetIds)
      .gte("date", since)
      .lte("date", until);
    mcd = r2.data;
  }
  if (!mcd?.length) return byDate;

  const campaignIds = Array.from(new Set(mcd.map((r) => String(r.campaign_id))));
  const metaByCampaign = await loadCampaignMeta(campaignIds);

  for (const row of mcd) {
    const meta = metaByCampaign.get(String(row.campaign_id));
    const split = reclassifyStoredMetrics(
      Number(row.leads) || 0,
      Number(row.messages) || 0,
      meta?.destination_type,
      meta?.objective,
      null,
      meta?.name,
    );
    const date = dayKey(row.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const cur = byDate.get(date) ?? {
      spend: 0, impressions: 0, clicks: 0, leads: 0, messages: 0,
    };
    cur.spend += Number(row.spend) || 0;
    cur.impressions += Number(row.impressions) || 0;
    cur.clicks += Number(row.clicks) || 0;
    cur.leads += split.leads;
    cur.messages += split.messages;
    byDate.set(date, cur);
  }

  return byDate;
}

/**
 * Пересчитывает лиды сайта / WhatsApp из meta_campaign_daily.
 * Возвращает null, если детализации по кампаниям нет.
 */
export async function fetchReclassifiedLeadSplit(
  cabinetIds: string[],
  since: string,
  until: string,
  projectId?: string | null,
): Promise<{ byDate: Map<string, DayLeadSplit>; leads: number; messages: number } | null> {
  const metrics = await fetchCampaignDayMetrics(cabinetIds, since, until, projectId);
  if (metrics.size === 0) return null;

  const byDate = new Map<string, DayLeadSplit>();
  let leads = 0;
  let messages = 0;
  for (const [date, m] of metrics) {
    byDate.set(date, { leads: m.leads, messages: m.messages });
    leads += m.leads;
    messages += m.messages;
  }
  return { byDate, leads, messages };
}

/** Найти cabinet_id по external_id (act_…). */
export async function resolveCabinetIdsByActIds(
  actIds: string[],
  projectId?: string | null,
): Promise<string[]> {
  if (actIds.length === 0) return [];
  const variants = new Set<string>();
  for (const id of actIds) {
    const t = id.trim();
    if (!t) continue;
    variants.add(t);
    const digits = t.replace(/^act_/i, "");
    variants.add(digits);
    variants.add(`act_${digits}`);
  }

  const matchCabinets = (rows: Array<{ id?: string; external_id?: string }> | null) => {
    const out: string[] = [];
    for (const c of rows ?? []) {
      const ext = String(c.external_id ?? "").trim();
      if (!ext) continue;
      const digits = ext.replace(/^act_/i, "");
      if (variants.has(ext) || variants.has(digits) || variants.has(`act_${digits}`)) {
        out.push(String(c.id));
      }
    }
    return out;
  };

  let q = supabase
    .from("ad_cabinets_safe" as any)
    .select("id, external_id")
    .eq("provider", "meta");
  if (projectId) q = q.eq("project_id", projectId);
  const { data } = await q;
  let out = matchCabinets(data as Array<{ id?: string; external_id?: string }> | null);

  // Фоллбэк без фильтра проекта
  if (out.length === 0 && projectId) {
    const r2 = await supabase
      .from("ad_cabinets_safe" as any)
      .select("id, external_id")
      .eq("provider", "meta");
    out = matchCabinets(r2.data as Array<{ id?: string; external_id?: string }> | null);
  }
  return out;
}
