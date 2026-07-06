import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AssetKind = "whatsapp" | "pixels" | "pixel_events" | "lead_forms" | "pages" | "instagram" | "ig_media";

export interface WhatsAppItem {
  id: string;
  display_phone_number: string;
  verified_name?: string;
}
export interface PixelItem {
  id: string;
  name: string;
  last_fired_time: string | null;
}
export interface PixelEventItem {
  name: string;
  count: number;
}
export interface LeadFormItem {
  id: string;
  name: string;
  status: string;
  leads_count: number;
}
export interface PageItem {
  id: string;
  name: string;
  category?: string;
  picture?: string;
  website?: string;
  instagram_id?: string;
  instagram_username?: string;
}
export interface InstagramItem {
  id: string;
  username?: string;
  name?: string;
}
export interface IgMediaItem {
  id: string;
  caption: string;
  media_type: string;
  thumbnail_url: string | null;
  permalink: string | null;
  timestamp: string | null;
}

type ItemMap = {
  whatsapp: WhatsAppItem;
  pixels: PixelItem;
  pixel_events: PixelEventItem;
  lead_forms: LeadFormItem;
  pages: PageItem;
  instagram: InstagramItem;
  ig_media: IgMediaItem;
};

interface Params {
  kind: AssetKind;
  actId?: string;
  pageId?: string;
  pixelId?: string;
  igId?: string;
  cabinetId?: string;
  enabled?: boolean;
}

// In-memory cache for Meta page assets (pages, forms, pixels…)
const cache = new Map<string, { ts: number; data: any[] }>();
const DEFAULT_TTL = 60_000;
const LONG_TTL = 5 * 60_000;
const TTL_BY_KIND: Partial<Record<AssetKind, number>> = {
  pages: LONG_TTL,
  lead_forms: LONG_TTL,
  pixels: LONG_TTL,
  whatsapp: LONG_TTL,
  instagram: LONG_TTL,
  pixel_events: LONG_TTL,
};

function cacheTtl(kind: AssetKind) {
  return TTL_BY_KIND[kind] ?? DEFAULT_TTL;
}

export function useMetaPageAssets<K extends AssetKind>({
  kind,
  actId,
  pageId,
  pixelId,
  igId,
  cabinetId,
  enabled = true,
}: Params & { kind: K }) {
  const [data, setData] = useState<ItemMap[K][]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const cacheKey = `${kind}|${actId ?? ""}|${pageId ?? ""}|${pixelId ?? ""}|${igId ?? ""}|${cabinetId ?? ""}`;
  const ttl = cacheTtl(kind);

  const fetchData = useCallback(
    async (force = false) => {
      if (!enabled) return;
      if (kind === "whatsapp" && !pageId && !actId && !cabinetId) return;
      if (kind === "pixels" && !actId && !cabinetId) return;
      if (kind === "pixel_events" && !pixelId) return;
      if (kind === "lead_forms" && !pageId) return;
      if (kind === "pages" && !actId && !cabinetId) return;
      if (kind === "ig_media" && !igId) return;

      const cached = cache.get(cacheKey);
      if (!force && cached && Date.now() - cached.ts < ttl) {
        setData(cached.data);
        setWarning(null);
        setLoading(false);
        setError(null);
        return;
      }

      const myId = ++reqIdRef.current;
      setLoading(true);
      setError(null);
      setWarning(null);

      const body: Record<string, string> = { kind };
      if (actId) body.actId = actId;
      if (pageId) body.pageId = pageId;
      if (pixelId) body.pixelId = pixelId;
      if (igId) body.igId = igId;
      if (cabinetId) body.cabinetId = cabinetId;

      const { data: resp, error: invokeErr } = await supabase.functions.invoke(
        "meta-page-assets",
        { method: "POST", body },
      );

      if (myId !== reqIdRef.current) return;

      if (invokeErr) {
        setError(invokeErr.message ?? "Ошибка запроса");
        setData([]);
        setLoading(false);
        return;
      }
      if (resp?.error) {
        const detail =
          resp.details?.message ?? resp.error ?? "Ошибка Meta API";
        setError(detail);
        setData([]);
        setLoading(false);
        return;
      }

      const items = (resp?.items ?? []) as ItemMap[K][];
      const respWarning = typeof resp?.warning === "string" ? resp.warning : null;
      cache.set(cacheKey, { ts: Date.now(), data: items });
      setData(items);
      setWarning(respWarning);
      if (respWarning && items.length === 0) {
        setError(respWarning);
      }
      setLoading(false);
    },
    [cacheKey, kind, actId, pageId, pixelId, igId, cabinetId, enabled, ttl],
  );

  useEffect(() => {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < ttl) {
      setData(cached.data);
      setLoading(false);
      setError(null);
    }
  }, [cacheKey, ttl]);

  useEffect(() => {
    fetchData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, enabled]);

  return { data, isLoading, error, warning, refetch: () => fetchData(true) };
}
