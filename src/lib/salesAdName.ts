import { looksLikeMetaAdId } from "@/lib/salesAnalyticsMetrics";
import { normalizePhoneDigits } from "@/lib/leadPhone";

type UtmLike = Record<string, string | undefined | null> | null | undefined;

/** Все варианты ключа для lookup по Meta ad id. */
export function metaAdIdKeys(id: string): string[] {
  const t = id.trim();
  if (!t) return [];
  const digits = t.replace(/\D/g, "");
  const keys = new Set<string>([t]);
  if (digits) {
    keys.add(digits);
    keys.add(`act_${digits}`);
  }
  return [...keys];
}

export function registerAdName(map: Map<string, string>, adId: string, name: string) {
  const label = name.trim();
  if (!label || looksLikeMetaAdId(label)) return;
  for (const k of metaAdIdKeys(adId)) map.set(k, label);
}

export function lookupAdName(map: Map<string, string>, adId: string | null | undefined): string | null {
  const id = (adId ?? "").trim();
  if (!id) return null;
  for (const k of metaAdIdKeys(id)) {
    const hit = map.get(k);
    if (hit) return hit;
  }
  return null;
}

export function extractAdNameFromUtm(utm: UtmLike): string | null {
  if (!utm) return null;
  const candidates = [
    utm.ad_name,
    utm.headline,
    utm.utm_content,
    utm.content,
  ];
  for (const raw of candidates) {
    const v = (raw ?? "").trim();
    if (!v || looksLikeMetaAdId(v)) continue;
    return v;
  }
  return null;
}

export function extractMetaAdIdFromLead(
  metaAdId: string | null | undefined,
  utm: UtmLike,
  phone: string | null | undefined,
  attrByPhone?: Map<string, string>,
): string | null {
  const direct = (metaAdId ?? "").trim();
  if (direct) return direct;

  const content = (utm?.utm_content ?? utm?.content ?? "").trim();
  if (content && looksLikeMetaAdId(content)) return content;

  const phoneKey = normalizePhoneDigits(phone ?? "").replace(/\D/g, "");
  if (phoneKey && attrByPhone?.has(phoneKey)) return attrByPhone.get(phoneKey)!;

  return null;
}

export type AdNameMaps = {
  creatives: Map<string, string>;
  campaigns: Map<string, string>;
};

export function resolveLeadAdName(
  effectiveAdId: string | null,
  utm: UtmLike,
  maps: AdNameMaps,
): string | null {
  if (effectiveAdId) {
    const fromCreative = lookupAdName(maps.creatives, effectiveAdId);
    if (fromCreative) return fromCreative;
    const fromCampaign = lookupAdName(maps.campaigns, effectiveAdId);
    if (fromCampaign) return fromCampaign;
  }
  return extractAdNameFromUtm(utm);
}
