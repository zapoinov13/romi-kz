import { supabase } from "@/integrations/supabase/client";
import { reclassifyStoredMetrics } from "@/lib/metaAdsMetrics";

export type DayLeadSplit = { leads: number; messages: number };

/**
 * Пересчитывает лиды сайта / WhatsApp из meta_campaign_daily
 * по destination / objective / имени кампании.
 * Возвращает null, если детализации по кампаниям нет.
 */
export async function fetchReclassifiedLeadSplit(
  cabinetIds: string[],
  since: string,
  until: string,
  projectId?: string | null,
): Promise<{ byDate: Map<string, DayLeadSplit>; leads: number; messages: number } | null> {
  if (cabinetIds.length === 0) return null;

  let mcdQ = supabase
    .from("meta_campaign_daily")
    .select("campaign_id, cabinet_id, date, leads, messages")
    .in("cabinet_id", cabinetIds)
    .gte("date", since)
    .lte("date", until);
  if (projectId) mcdQ = mcdQ.eq("project_id", projectId);
  const { data: mcd, error } = await mcdQ;
  if (error || !mcd?.length) return null;

  const campaignIds = Array.from(new Set(mcd.map((r) => String(r.campaign_id))));
  const metaByCampaign = new Map<
    string,
    { destination_type: string | null; objective: string | null; name: string | null }
  >();

  if (campaignIds.length > 0) {
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
  }

  const byDate = new Map<string, DayLeadSplit>();
  let leads = 0;
  let messages = 0;

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
    const date = String(row.date);
    const cur = byDate.get(date) ?? { leads: 0, messages: 0 };
    cur.leads += split.leads;
    cur.messages += split.messages;
    byDate.set(date, cur);
    leads += split.leads;
    messages += split.messages;
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
  let q = supabase
    .from("ad_cabinets_safe" as any)
    .select("id, external_id")
    .eq("provider", "meta");
  if (projectId) q = q.eq("project_id", projectId);
  const { data } = await q;
  const out: string[] = [];
  for (const c of data ?? []) {
    const ext = String((c as { external_id?: string }).external_id ?? "").trim();
    if (!ext) continue;
    const digits = ext.replace(/^act_/i, "");
    if (variants.has(ext) || variants.has(digits) || variants.has(`act_${digits}`)) {
      out.push(String((c as { id: string }).id));
    }
  }
  return out;
}
