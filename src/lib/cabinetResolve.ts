import type { AdCabinet } from "@/types/ads";

/** Meta ad account id: column ad_account_id or legacy external_id. */
export function resolveCabinetActId(
  cab?: Pick<AdCabinet, "adAccountId" | "externalId"> | null,
): string | undefined {
  const act = String(cab?.adAccountId ?? cab?.externalId ?? "").trim();
  return act || undefined;
}

export function enrichCabinetForMeta(
  cab?: AdCabinet | null,
  overrides?: { pageId?: string },
): AdCabinet | undefined {
  if (!cab) return undefined;
  const act = resolveCabinetActId(cab);
  return {
    ...cab,
    adAccountId: act,
    pageId: overrides?.pageId || cab.pageId,
  };
}
