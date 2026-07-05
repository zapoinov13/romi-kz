// Resolve ad_cabinets Meta fields for server-side launch (Telegram bot, etc.).
// Merges columns + config JSONB + instagram_accounts, then auto-discovers page via Graph API.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const GRAPH = "https://graph.facebook.com/v21.0";

export type CabinetMetaRow = {
  id: string;
  project_id?: string | null;
  name: string | null;
  external_id: string | null;
  ad_account_id: string | null;
  page_id: string | null;
  page_name: string | null;
  instagram_id: string | null;
  access_token: string | null;
  whatsapp_number: string | null;
  pixel_id: string | null;
  pixel_event: string | null;
  website_url: string | null;
  business_id: string | null;
  app_id: string | null;
  currency: string | null;
  lead_form_id: string | null;
  config?: Record<string, unknown> | null;
};

export const CABINET_META_SELECT =
  "id, project_id, name, external_id, ad_account_id, page_id, page_name, instagram_id, access_token, whatsapp_number, pixel_id, pixel_event, website_url, business_id, app_id, currency, lead_form_id, config";

function pickConfigStr(config: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = config[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

export function normalizeActId(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const digits = s.replace(/^act_/i, "").replace(/\D/g, "");
  if (!digits) return "";
  return `act_${digits}`;
}

export function resolveAdAccountId(cab: CabinetMetaRow | null | undefined): string {
  if (!cab) return "";
  const config = (cab.config ?? {}) as Record<string, unknown>;
  const fromCol = String(cab.ad_account_id ?? "").trim();
  const fromExt = String(cab.external_id ?? "").trim();
  const fromCfg = pickConfigStr(
    config,
    "adAccountId",
    "ad_account_id",
    "adAccount",
    "externalId",
    "external_id",
  );
  return fromCol || fromExt || fromCfg;
}

export function resolvePageId(cab: CabinetMetaRow | null | undefined): string {
  if (!cab) return "";
  const config = (cab.config ?? {}) as Record<string, unknown>;
  return String(cab.page_id ?? "").trim() || pickConfigStr(config, "pageId", "page_id");
}

export function cabinetLaunchMissingFields(
  cab: CabinetMetaRow | null | undefined,
  destination: string,
): string[] {
  const missing: string[] = [];
  if (!cab) return ["кабинет не найден"];
  if (!resolveAdAccountId(cab)) missing.push("ad_account_id (рекламный аккаунт act_…)");
  if (!resolvePageId(cab)) missing.push("page_id (Facebook-страница)");
  if (destination === "whatsapp") {
    const config = (cab.config ?? {}) as Record<string, unknown>;
    const wa = String(cab.whatsapp_number ?? "").trim()
      || pickConfigStr(config, "whatsappNumber", "whatsapp_number");
    const digits = wa.replace(/\D/g, "");
    if (digits.length < 10) missing.push("whatsapp_number");
  }
  if (destination === "site") {
    const config = (cab.config ?? {}) as Record<string, unknown>;
    const px = String(cab.pixel_id ?? "").trim()
      || pickConfigStr(config, "pixelId", "pixel_id", "fb_pixel_id");
    if (!px) missing.push("pixel_id");
  }
  return missing;
}

export function cabinetFieldsErrorText(cabName: string, missing: string[]): string {
  return (
    `⚠️ У кабинета <b>${cabName}</b> не хватает данных для запуска:\n` +
    missing.map((f) => `• ${f}`).join("\n") +
    "\n\nСистема уже пробовала подтянуть их из Meta автоматически. " +
    "Если ошибка повторяется — открой <b>Реклама → карточка кабинета</b> и сохрани Page ID / Ad Account."
  );
}

export function clientConfigFromCabinet(
  cab: CabinetMetaRow,
  metaToken: string,
  budget: number | null,
) {
  const config = (cab.config ?? {}) as Record<string, unknown>;
  const adAccountId = normalizeActId(resolveAdAccountId(cab));
  const pageId = resolvePageId(cab);
  const pixelId = String(cab.pixel_id ?? "").trim()
    || pickConfigStr(config, "pixelId", "pixel_id", "fb_pixel_id");
  const whatsapp = String(cab.whatsapp_number ?? "").trim()
    || pickConfigStr(config, "whatsappNumber", "whatsapp_number");
  const website = cab.website_url
    || pickConfigStr(config, "websiteUrl", "website_url", "landing_url")
    || null;

  return {
    client_name: cab.name,
    ad_account_id: adAccountId,
    page_id: pageId,
    page_name: cab.page_name || pickConfigStr(config, "pageName", "page_name") || null,
    instagram_actor_id: String(cab.instagram_id ?? "").trim()
      || pickConfigStr(config, "instagramId", "instagram_id", "instagram_actor_id"),
    fb_pixel_id: pixelId || null,
    pixel_event: (cab.pixel_event ?? pickConfigStr(config, "pixelEvent", "pixel_event")) || "Lead",
    website_url: website,
    whatsapp_number: whatsapp || null,
    business_id: cab.business_id,
    app_id: cab.app_id,
    currency: cab.currency,
    lead_form_id: (cab.lead_form_id ?? pickConfigStr(config, "leadFormId", "lead_form_id")) || null,
    access_token: metaToken,
    daily_budget: budget ? Math.round(Number(budget) * 100) : undefined,
  };
}

/** Merge DB columns + config + linked IG account; discover page from Meta if needed. */
export async function enrichCabinetMeta(
  admin: ReturnType<typeof createClient>,
  cabRow: CabinetMetaRow | null,
  metaTokens: string[],
): Promise<CabinetMetaRow | null> {
  if (!cabRow) return null;

  const config = (cabRow.config ?? {}) as Record<string, unknown>;
  const enriched: CabinetMetaRow = {
    ...cabRow,
    ad_account_id: resolveAdAccountId(cabRow) || null,
    external_id: String(cabRow.external_id ?? "").trim()
      || pickConfigStr(config, "externalId", "external_id")
      || resolveAdAccountId(cabRow)
      || null,
    page_id: resolvePageId(cabRow) || null,
    page_name: cabRow.page_name || pickConfigStr(config, "pageName", "page_name") || null,
    instagram_id: String(cabRow.instagram_id ?? "").trim()
      || pickConfigStr(config, "instagramId", "instagram_id", "instagram_actor_id")
      || null,
    pixel_id: String(cabRow.pixel_id ?? "").trim()
      || pickConfigStr(config, "pixelId", "pixel_id", "fb_pixel_id")
      || null,
    whatsapp_number: String(cabRow.whatsapp_number ?? "").trim()
      || pickConfigStr(config, "whatsappNumber", "whatsapp_number")
      || null,
    website_url: cabRow.website_url
      || pickConfigStr(config, "websiteUrl", "website_url")
      || null,
  };

  if (cabRow.project_id) {
    const { data: ig } = await admin
      .from("instagram_accounts")
      .select("ig_user_id, page_id, page_name")
      .eq("project_id", cabRow.project_id)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ig) {
      if (!enriched.instagram_id && ig.ig_user_id) enriched.instagram_id = String(ig.ig_user_id);
      if (!enriched.page_id && ig.page_id) {
        enriched.page_id = String(ig.page_id);
        enriched.page_name = enriched.page_name || (ig.page_name as string | null);
      }
    }
  }

  const actId = normalizeActId(resolveAdAccountId(enriched));
  if (!resolvePageId(enriched) && actId && metaTokens.length > 0) {
    for (const tok of metaTokens) {
      try {
        const url = `${GRAPH}/${actId}/promote_pages?fields=id,name,instagram_business_account&limit=5&access_token=${encodeURIComponent(tok)}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!r.ok) continue;
        const j = await r.json() as {
          data?: Array<{ id?: string; name?: string; instagram_business_account?: { id?: string } }>;
        };
        const page = j.data?.[0];
        if (page?.id) {
          enriched.page_id = String(page.id);
          enriched.page_name = page.name ?? enriched.page_name;
          const igBiz = page.instagram_business_account?.id;
          if (!enriched.instagram_id && igBiz) enriched.instagram_id = String(igBiz);
          break;
        }
      } catch {
        /* try next token */
      }
    }
  }

  const patch: Record<string, unknown> = {};
  if (enriched.page_id && enriched.page_id !== cabRow.page_id) {
    patch.page_id = enriched.page_id;
    if (enriched.page_name) patch.page_name = enriched.page_name;
  }
  const resolvedAct = normalizeActId(resolveAdAccountId(enriched));
  if (resolvedAct && !cabRow.ad_account_id) patch.ad_account_id = resolvedAct;
  if (resolvedAct && !String(cabRow.external_id ?? "").trim()) patch.external_id = resolvedAct;
  if (enriched.instagram_id && !cabRow.instagram_id) patch.instagram_id = enriched.instagram_id;
  if (Object.keys(patch).length > 0) {
    await admin.from("ad_cabinets").update(patch).eq("id", cabRow.id);
  }

  return enriched;
}
