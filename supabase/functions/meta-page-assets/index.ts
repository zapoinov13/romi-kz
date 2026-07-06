import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import {
  requireUser,
  requireMetaAdAccountAccess,
  createUserClient,
} from "../_lib/auth.ts";
import { resolveMetaTokens } from "../_lib/meta_tokens.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const META_API_VERSION = "v21.0";

function normalizeActId(id: string): string {
  const t = id.trim();
  if (/^act_\d+$/i.test(t)) return `act_${t.replace(/^act_/i, "")}`;
  if (/^\d+$/.test(t)) return `act_${t}`;
  return t;
}

async function metaGet(path: string, token: string) {
  const sep = path.includes("?") ? "&" : "?";
  const url =
    `https://graph.facebook.com/${META_API_VERSION}${path}${sep}access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body: j as any };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const FALLBACK_PIXEL_EVENTS = [
  "Lead",
  "Purchase",
  "Contact",
  "CompleteRegistration",
  "Subscribe",
  "SubmitApplication",
  "AddToCart",
  "InitiateCheckout",
  "ViewContent",
  "Schedule",
];

type AssetParams = {
  kind: string | null;
  actId: string | null;
  pageId: string | null;
  pixelId: string | null;
  igId: string | null;
  cabinetId: string | null;
};

async function readAssetParams(req: Request, url: URL): Promise<AssetParams> {
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }
  const pick = (key: keyof AssetParams) => {
    const fromQuery = url.searchParams.get(key);
    if (fromQuery) return fromQuery;
    const fromBody = body[key];
    return typeof fromBody === "string" && fromBody.trim() ? fromBody.trim() : null;
  };
  return {
    kind: pick("kind"),
    actId: pick("actId"),
    pageId: pick("pageId"),
    pixelId: pick("pixelId"),
    igId: pick("igId"),
    cabinetId: pick("cabinetId"),
  };
}

function pickConfigStr(config: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = config[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

async function loadCabinetMeta(
  admin: ReturnType<typeof createClient>,
  cabinetId: string | null,
) {
  if (!cabinetId) return null;
  const { data: cab } = await admin
    .from("ad_cabinets")
    .select("id, name, ad_account_id, external_id, page_id, page_name, access_token, lead_form_id, config, project_id")
    .eq("id", cabinetId)
    .maybeSingle();
  if (!cab) return null;
  const cfg = (cab.config ?? {}) as Record<string, unknown>;
  const adAccountId = String(cab.ad_account_id ?? cab.external_id ?? "")
    .trim()
    || pickConfigStr(cfg, "adAccountId", "ad_account_id", "adAccountID");
  const pageId = String(cab.page_id ?? "").trim()
    || pickConfigStr(cfg, "pageId", "page_id");
  const pageName = String(cab.page_name ?? "").trim()
    || pickConfigStr(cfg, "pageName", "page_name");
  const accessToken = String(cab.access_token ?? "").trim()
    || pickConfigStr(cfg, "accessToken", "access_token");
  return { ...cab, adAccountId, pageId, pageName, accessToken, config: cfg };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const metaTokens = await resolveMetaTokens();
    if (metaTokens.length === 0) {
      return jsonResponse(
        { error: "Meta access token не настроен (Настройки → Подключить Meta)." },
        500,
      );
    }
    const META_ACCESS_TOKEN = metaTokens[0];

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const url = new URL(req.url);
    const params = await readAssetParams(req, url);
    const kind = params.kind;
    let actId = params.actId;
    const pageId = params.pageId;
    const pixelId = params.pixelId;
    const igId = params.igId;
    const cabinetId = params.cabinetId;

    if (!kind) return jsonResponse({ error: "kind is required" }, 400);

    const cabinetMeta = await loadCabinetMeta(admin, cabinetId);
    if (!actId && cabinetMeta?.adAccountId) actId = cabinetMeta.adAccountId;

    const isDiscovery =
      kind === "pages" || kind === "pixels" || kind === "instagram" ||
      kind === "ig_media" || kind === "whatsapp" || kind === "lead_forms";

    if (actId && !isDiscovery) {
      const actAccess = await requireMetaAdAccountAccess(auth.authHeader, actId);
      if (!actAccess.ok) return actAccess.response;
    } else if (pageId && !isDiscovery) {
      const client = createUserClient(auth.authHeader);
      const { data: cab } = await client
        .from("ad_cabinets")
        .select("id")
        .eq("page_id", pageId)
        .limit(1)
        .maybeSingle();
      if (!cab) return jsonResponse({ error: "Forbidden" }, 403);
    } else if (pixelId) {
      const client = createUserClient(auth.authHeader);
      const { data: cab } = await client
        .from("ad_cabinets")
        .select("id")
        .eq("pixel_id", pixelId)
        .limit(1)
        .maybeSingle();
      if (!cab) return jsonResponse({ error: "Forbidden" }, 403);
    }

    // ============ WHATSAPP ============
    if (kind === "whatsapp") {
      if (!pageId && !actId) {
        return jsonResponse({ error: "pageId or actId is required" }, 400);
      }

      const debug = url.searchParams.get("debug") === "1";
      const sources: Record<string, unknown> = {};
      const phones: Array<{
        id: string;
        display_phone_number: string;
        verified_name?: string;
      }> = [];
      const seen = new Set<string>();
      const addPhone = (
        id: string,
        display: string,
        verified_name?: string,
      ) => {
        const key = String(display).replace(/\D/g, "");
        if (!key || seen.has(key)) return;
        seen.add(key);
        phones.push({
          id: String(id),
          display_phone_number: String(display),
          verified_name,
        });
      };

      // Try to get a Page Access Token (more permissions than user token).
      let pageToken: string | undefined;
      let pageName: string | undefined;
      if (pageId) {
        const pageTokenResp = await metaGet(
          `/${pageId}?fields=access_token,name`,
          META_ACCESS_TOKEN,
        );
        pageToken = pageTokenResp.body?.access_token;
        pageName = pageTokenResp.body?.name;
        if (debug) sources.page_token_resp = pageTokenResp.body;
      }

      const tryToken = pageToken ?? META_ACCESS_TOKEN;

      // Helper: extract phone digits from arbitrary URL/string
      const extractPhone = (raw: unknown): string | null => {
        if (!raw) return null;
        const c = String(raw);
        const m =
          c.match(/wa\.me\/(\+?\d{8,15})/i) ||
          c.match(/whatsapp\.com\/.*[?&]phone=(\+?\d{8,15})/i) ||
          c.match(/(\+?\d{10,15})/);
        if (!m) return null;
        const digits = (m[1] ?? m[0]).replace(/\D/g, "");
        return digits.length >= 10 ? "+" + digits : null;
      };

      if (pageId) {
        // 1) Connected WhatsApp Business Account -> phone_numbers
        const waba = await metaGet(
          `/${pageId}?fields=connected_whatsapp_business_account{phone_numbers{id,display_phone_number,verified_name}}`,
          tryToken,
        );
        if (debug) sources.connected_waba = waba.body;
        const wabaPhones =
          waba.body?.connected_whatsapp_business_account?.phone_numbers?.data;
        if (Array.isArray(wabaPhones)) {
          for (const p of wabaPhones) {
            addPhone(
              p.id ?? p.display_phone_number,
              p.display_phone_number,
              p.verified_name,
            );
          }
        }

        // 2) page_call_to_actions
        const ctas = await metaGet(
          `/${pageId}/call_to_actions?fields=type,web_destination,android_destination,iphone_destination,intl_number_with_plus`,
          tryToken,
        );
        if (debug) sources.call_to_actions = ctas.body;
        if (Array.isArray(ctas.body?.data)) {
          for (const cta of ctas.body.data) {
            for (
              const c of [
                cta.web_destination,
                cta.android_destination,
                cta.iphone_destination,
                cta.intl_number_with_plus,
              ]
            ) {
              const num = extractPhone(c);
              if (num) addPhone(num, num, pageName);
            }
          }
        }

        // 3) Direct page field whatsapp_number
        const pageWa = await metaGet(
          `/${pageId}?fields=whatsapp_number`,
          tryToken,
        );
        if (debug) sources.page_whatsapp_number = pageWa.body;
        const num = extractPhone(pageWa.body?.whatsapp_number);
        if (num) addPhone(num, num, pageName);
      }

      // 4) CTWA numbers actually used in ads of this ad account.
      if (actId) {
        const acct = normalizeActId(actId);

        // 4a) Business-owned WhatsApp accounts
        const bizWa = await metaGet(
          `/${acct}?fields=business{owned_whatsapp_business_accounts{phone_numbers{id,display_phone_number,verified_name}}}`,
          META_ACCESS_TOKEN,
        );
        if (debug) sources.business_waba = bizWa.body;
        const bizAccounts = bizWa.body?.business?.owned_whatsapp_business_accounts?.data;
        if (Array.isArray(bizAccounts)) {
          for (const acc of bizAccounts) {
            const nums = acc?.phone_numbers?.data;
            if (!Array.isArray(nums)) continue;
            for (const p of nums) {
              addPhone(
                p.id ?? p.display_phone_number,
                p.display_phone_number,
                p.verified_name,
              );
            }
          }
        }

        // 4b) Ad sets with WhatsApp destination — promoted_object.page_id + whatsapp_phone_number
        const adsets = await metaGet(
          `/${acct}/adsets?fields=name,destination_type,promoted_object&limit=200`,
          META_ACCESS_TOKEN,
        );
        if (debug) sources.adsets = adsets.body;
        if (Array.isArray(adsets.body?.data)) {
          for (const a of adsets.body.data) {
            const po = a?.promoted_object ?? {};
            for (
              const v of [
                po.whatsapp_phone_number,
                po.phone_number,
                po.application_id,
              ]
            ) {
              const num = extractPhone(v);
              if (num) addPhone(num, num, a?.name ?? "CTWA Ad Set");
            }
          }
        }

        // 4c) Ads -> creative{...} with destination_set / link_data
        const ads = await metaGet(
          `/${acct}/ads?fields=name,creative{object_story_spec{link_data{link,call_to_action{value{link}}},video_data{call_to_action{value{link}}}},asset_feed_spec{link_urls{website_url},call_to_action_types}}&limit=200`,
          META_ACCESS_TOKEN,
        );
        if (debug) sources.ads = ads.body;
        if (Array.isArray(ads.body?.data)) {
          for (const ad of ads.body.data) {
            const cr = ad?.creative ?? {};
            const candidates: unknown[] = [];
            const oss = cr?.object_story_spec ?? {};
            if (oss?.link_data?.link) candidates.push(oss.link_data.link);
            if (oss?.link_data?.call_to_action?.value?.link) {
              candidates.push(oss.link_data.call_to_action.value.link);
            }
            if (oss?.video_data?.call_to_action?.value?.link) {
              candidates.push(oss.video_data.call_to_action.value.link);
            }
            if (Array.isArray(cr?.asset_feed_spec?.link_urls)) {
              for (const l of cr.asset_feed_spec.link_urls) {
                if (l?.website_url) candidates.push(l.website_url);
              }
            }
            for (const c of candidates) {
              const num = extractPhone(c);
              if (num) addPhone(num, num, ad?.name ?? "CTWA-объявление");
            }
          }
        }
      }

      // 5) Retry WABA discovery with alternate Meta tokens (other BM / OAuth accounts).
      if (phones.length === 0 && pageId) {
        for (const tok of metaTokens.slice(1)) {
          const waba = await metaGet(
            `/${pageId}?fields=connected_whatsapp_business_account{phone_numbers{id,display_phone_number,verified_name}}`,
            tok,
          );
          const wabaPhones =
            waba.body?.connected_whatsapp_business_account?.phone_numbers?.data;
          if (Array.isArray(wabaPhones)) {
            for (const p of wabaPhones) {
              addPhone(
                p.id ?? p.display_phone_number,
                p.display_phone_number,
                p.verified_name,
              );
            }
          }
          if (phones.length > 0) break;
        }
      }

      // 6) Saved cabinet / Green API phone (UI fallback when Graph API returns empty).
      if (cabinetId) {
        const { data: cab } = await admin
          .from("ad_cabinets")
          .select("whatsapp_number, config, project_id")
          .eq("id", cabinetId)
          .maybeSingle();
        const cfg = (cab?.config ?? {}) as Record<string, unknown>;
        const fromCol = String(cab?.whatsapp_number ?? "").trim();
        const fromCfg = String(
          cfg.whatsappNumber ?? cfg.whatsapp_number ?? "",
        ).trim();
        for (const raw of [fromCol, fromCfg]) {
          const num = extractPhone(raw) ?? (raw.replace(/\D/g, "").length >= 10 ? raw : null);
          if (num) addPhone(num, num, "из кабинета");
        }
        if (cab?.project_id) {
          const { data: waCfg } = await admin
            .from("whatsapp_config")
            .select("phone")
            .eq("project_id", cab.project_id)
            .maybeSingle();
          const ph = String(waCfg?.phone ?? "").trim();
          if (ph) {
            const num = extractPhone(ph) ?? ph;
            addPhone(num, num, "Green API проекта");
          }
        }
      }

      if (debug) {
        return jsonResponse({ items: phones, debug: sources });
      }
      return jsonResponse({ items: phones });
    }

    // ============ PAGES ============
    // Returns Facebook Pages that can be used as the "from" page for ads on this ad account.
    if (kind === "pages") {
      if (!actId && !cabinetMeta?.pageId) {
        return jsonResponse({ error: "actId or cabinet with page_id is required" }, 400);
      }
      const seen = new Set<string>();
      const items: Array<{
        id: string;
        name: string;
        category?: string;
        picture?: string;
        website?: string;
        instagram_id?: string;
        instagram_username?: string;
      }> = [];
      const push = (p: any) => {
        const id = String(p?.id ?? "");
        if (!id || seen.has(id)) return;
        seen.add(id);
        const igBiz = p?.instagram_business_account;
        const igConn = p?.connected_instagram_account;
        items.push({
          id,
          name: p?.name ?? id,
          category: p?.category ?? undefined,
          picture: p?.picture?.data?.url ?? undefined,
          website: p?.website ?? undefined,
          instagram_id: igBiz?.id ?? igConn?.id ?? undefined,
          instagram_username: igBiz?.username ?? igConn?.username ?? undefined,
        });
      };
      const pageFields =
        "id,name,category,picture{url},website,instagram_business_account{id,username},connected_instagram_account{id,username}";
      const debug = url.searchParams.get("debug") === "1";
      const dbg: Record<string, unknown> = {};
      const acct = actId ? normalizeActId(actId) : "";
      const tokens = Array.from(
        new Set([cabinetMeta?.accessToken, ...metaTokens].filter(Boolean) as string[]),
      );

      const fetchPagesForToken = async (token: string) => {
        if (acct) {
          const r1 = await metaGet(
            `/${acct}/promote_pages?fields=${pageFields}&limit=200`,
            token,
          );
          if (debug) dbg[`promote_pages_${token.slice(0, 6)}`] = r1.body;
          if (r1.ok && Array.isArray(r1.body?.data)) r1.body.data.forEach(push);

          if (items.length === 0) {
            const r2 = await metaGet(
              `/${acct}?fields=business{owned_pages{${pageFields}},client_pages{${pageFields}},pages{${pageFields}}}`,
              token,
            );
            if (debug) dbg[`business_pages_${token.slice(0, 6)}`] = r2.body;
            const biz = r2.body?.business ?? {};
            for (const k of ["owned_pages", "client_pages", "pages"] as const) {
              const arr = biz?.[k]?.data;
              if (Array.isArray(arr)) arr.forEach(push);
            }
          }

          // Last resort: scan ads of this ad account for any referenced page_id.
          if (items.length === 0) {
            const r4 = await metaGet(
              `/${acct}/ads?fields=creative{object_story_spec{page_id}}&limit=200`,
              token,
            );
            if (debug) dbg[`ads_pages_${token.slice(0, 6)}`] = r4.body;
            const pageIds = new Set<string>();
            if (Array.isArray(r4.body?.data)) {
              for (const ad of r4.body.data) {
                const pid = ad?.creative?.object_story_spec?.page_id;
                if (pid) pageIds.add(String(pid));
              }
            }
            for (const pid of pageIds) {
              const rp = await metaGet(`/${pid}?fields=${pageFields}`, token);
              if (rp.ok && rp.body?.id) push(rp.body);
            }
          }
        }
      };

      for (const token of tokens) {
        await fetchPagesForToken(token);
        if (items.length > 0) break;
      }

      if (cabinetMeta?.pageId) {
        const savedId = cabinetMeta.pageId;
        if (!seen.has(savedId)) {
          const savedName = cabinetMeta.pageName || `${cabinetMeta.name} · из кабинета`;
          push({ id: savedId, name: savedName });
          for (const token of tokens) {
            const rp = await metaGet(`/${savedId}?fields=${pageFields}`, token);
            if (rp.ok && rp.body?.id) {
              push(rp.body);
              break;
            }
          }
        }
      }

      if (debug) return jsonResponse({ items, debug: dbg });
      if (items.length === 0) {
        return jsonResponse({
          items: [],
          warning:
            "Не удалось найти Facebook-страницы. Проверьте Ad Account ID в кабинете и права Meta-токена (pages_show_list, pages_manage_ads).",
        });
      }
      return jsonResponse({ items });
    }

    // ============ INSTAGRAM ============
    // Returns the Instagram Business account connected to a Facebook Page.
    if (kind === "instagram") {
      if (!pageId) return jsonResponse({ error: "pageId is required" }, 400);
      const r = await metaGet(
        `/${pageId}?fields=instagram_business_account{id,username,name},connected_instagram_account{id,username,name}`,
        META_ACCESS_TOKEN,
      );
      const items: Array<{ id: string; username?: string; name?: string }> = [];
      const ig = r.body?.instagram_business_account;
      const ig2 = r.body?.connected_instagram_account;
      if (ig?.id) items.push({ id: String(ig.id), username: ig.username, name: ig.name });
      if (ig2?.id && ig2.id !== ig?.id) {
        items.push({ id: String(ig2.id), username: ig2.username, name: ig2.name });
      }
      return jsonResponse({ items });
    }

    // ============ INSTAGRAM MEDIA (existing posts to boost) ============
    if (kind === "ig_media") {
      if (!igId) return jsonResponse({ error: "igId is required" }, 400);
      // /{ig-user-id}/media — список последних публикаций IG Business аккаунта.
      // Возвращаем id (это IG media id, который Meta принимает в
      // adcreatives.source_instagram_media_id), превью, подпись и timestamp.
      const r = await metaGet(
        `/${igId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=50`,
        META_ACCESS_TOKEN,
      );
      if (!r.ok) {
        const warning = r.body?.error?.message ??
          "Не удалось получить публикации Instagram (проверьте права токена: instagram_basic, pages_show_list).";
        return jsonResponse({ items: [], warning, meta_status: r.status });
      }
      const items = (r.body?.data ?? []).map((m: any) => ({
        id: String(m.id),
        caption: m.caption ?? "",
        media_type: m.media_type ?? "IMAGE",
        thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
        permalink: m.permalink ?? null,
        timestamp: m.timestamp ?? null,
      }));
      return jsonResponse({ items });
    }

    // ============ PIXELS ============
    if (kind === "pixels") {
      if (!actId) return jsonResponse({ error: "actId is required" }, 400);
      const r = await metaGet(
        `/${normalizeActId(actId)}/adspixels?fields=id,name,last_fired_time&limit=100`,
        META_ACCESS_TOKEN,
      );
      if (!r.ok) {
        const warning = r.body?.error?.message ??
          "Не удалось получить пиксели (проверьте права токена Meta: ads_management или ads_read).";
        return jsonResponse({ items: [], warning, meta_status: r.status });
      }
      const items = (r.body?.data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        last_fired_time: p.last_fired_time ?? null,
      }));
      if (cabinetId) {
        const { data: cab } = await admin
          .from("ad_cabinets")
          .select("pixel_id, config")
          .eq("id", cabinetId)
          .maybeSingle();
        const cfg = (cab?.config ?? {}) as Record<string, unknown>;
        const saved = String(cab?.pixel_id ?? cfg.pixelId ?? cfg.pixel_id ?? "").trim();
        if (saved && !items.some((p: { id: string }) => p.id === saved)) {
          items.unshift({ id: saved, name: `${saved} (из кабинета)`, last_fired_time: null });
        }
      }
      return jsonResponse({ items });
    }

    // ============ PIXEL EVENTS ============
    if (kind === "pixel_events") {
      if (!pixelId) return jsonResponse({ error: "pixelId is required" }, 400);
      const start = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
      const r = await metaGet(
        `/${pixelId}/stats?aggregation=event&start_time=${start}`,
        META_ACCESS_TOKEN,
      );
      const recent = new Map<string, number>();
      if (r.ok && Array.isArray(r.body?.data)) {
        for (const row of r.body.data) {
          if (Array.isArray(row?.data)) {
            for (const entry of row.data) {
              const evt = entry?.event ?? entry?.value;
              const cnt = Number(entry?.count ?? 0);
              if (evt) recent.set(evt, (recent.get(evt) ?? 0) + cnt);
            }
          }
        }
      }
      // Merge recent + fallback list (recent first, sorted by count desc)
      const sortedRecent = Array.from(recent.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));
      const recentNames = new Set(sortedRecent.map((e) => e.name));
      const fallback = FALLBACK_PIXEL_EVENTS.filter((n) => !recentNames.has(n))
        .map((name) => ({ name, count: 0 }));
      return jsonResponse({ items: [...sortedRecent, ...fallback] });
    }

    // ============ LEAD FORMS ============
    if (kind === "lead_forms") {
      if (!pageId) return jsonResponse({ error: "pageId is required" }, 400);

      const tokens = Array.from(
        new Set([cabinetMeta?.accessToken, ...metaTokens].filter(Boolean) as string[]),
      );
      let items: Array<{ id: string; name: string; status: string; leads_count: number }> = [];
      let warning: string | undefined;

      for (const userToken of tokens) {
        const pageTokenResp = await metaGet(
          `/${pageId}?fields=access_token`,
          userToken,
        );
        const pageToken: string | undefined = pageTokenResp.body?.access_token;
        const tokenToUse = pageToken ?? userToken;
        const r = await metaGet(
          `/${pageId}/leadgen_forms?fields=id,name,status,leads_count&limit=200`,
          tokenToUse,
        );
        if (r.ok && Array.isArray(r.body?.data)) {
          items = r.body.data.map((f: any) => ({
            id: String(f.id),
            name: f.name,
            status: f.status,
            leads_count: Number(f.leads_count ?? 0),
          }));
          if (items.length > 0) break;
        } else {
          warning = r.body?.error?.message ??
            "Не удалось получить лид-формы (проверьте права токена Meta: pages_manage_ads, leads_retrieval).";
        }
      }

      const savedFormId = String(
        (cabinetMeta as { lead_form_id?: string | null })?.lead_form_id ??
          cabinetMeta?.config?.leadFormId ??
          cabinetMeta?.config?.lead_form_id ??
          "",
      ).trim();
      if (savedFormId && !items.some((f) => f.id === savedFormId)) {
        items.unshift({
          id: savedFormId,
          name: `${savedFormId} (из кабинета)`,
          status: "ACTIVE",
          leads_count: 0,
        });
      }

      return jsonResponse({ items, ...(warning && items.length === 0 ? { warning } : {}) });
    }

    return jsonResponse({ error: `Unknown kind: ${kind}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("meta-page-assets error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
