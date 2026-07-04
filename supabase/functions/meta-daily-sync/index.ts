import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { requireUser, userHasRole } from "../_lib/auth.ts";
import {
  PURCHASE_ACTIONS,
  splitLeadsAndMessages,
  sumActions,
  type MetaAction,
} from "../_lib/metaMetrics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API_VERSION = "v21.0";

async function fetchAllPages<T extends Record<string, unknown>>(
  startUrl: string,
  fetchFn: (url: string) => Promise<Response>,
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = startUrl;
  let pages = 0;
  while (url && pages < maxPages) {
    pages += 1;
    const res = await fetchFn(url);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    }
    const data = (json?.data ?? []) as T[];
    out.push(...data);
    url = (json?.paging?.next as string | undefined) ?? null;
  }
  return out;
}
function normalizeActId(id: string) {
  const t = id.trim();
  if (/^act_\d+$/i.test(t)) return `act_${t.replace(/^act_/i, "")}`;
  if (/^\d+$/.test(t)) return `act_${t}`;
  return t;
}
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function ymdInTimeZone(d: Date, timeZone = "Asia/Almaty") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDaysYmd(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

function ymdToDmy(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}
function parseUsdFromXml(xml: string): number | null {
  const items = xml.split(/<item[\s>]/i).slice(1);
  for (const it of items) {
    const t = it.match(/<title>\s*([^<]+?)\s*<\/title>/i);
    const dsc = it.match(/<description>\s*([^<]+?)\s*<\/description>/i);
    if (t && dsc && t[1].trim().toUpperCase() === "USD") {
      const v = Number(dsc[1].replace(",", "."));
      if (Number.isFinite(v) && v > 0) return v;
    }
  }
  return null;
}
async function fetchNbkRate(date: string): Promise<number | null> {
  for (let i = 0; i < 8; i++) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    try {
      const r = await fetch(`https://nationalbank.kz/rss/get_rates.cfm?fdate=${ymdToDmy(dStr)}`);
      if (!r.ok) continue;
      const v = parseUsdFromXml(await r.text());
      if (v) return v;
    } catch (_) { /* next */ }
  }
  return null;
}
async function getRatesForDates(
  admin: ReturnType<typeof createClient>,
  dates: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (dates.length === 0) return map;
  const { data } = await admin.from("fx_rates").select("date, usd_kzt").in("date", dates);
  for (const r of (data ?? []) as Array<{ date: string; usd_kzt: number | string }>) {
    map.set(r.date, Number(r.usd_kzt));
  }
  for (const d of dates) {
    if (map.has(d)) continue;
    const rate = await fetchNbkRate(d);
    if (rate) {
      map.set(d, rate);
      await admin.from("fx_rates").upsert(
        { date: d, usd_kzt: rate, source: "nbk", fetched_at: new Date().toISOString() },
        { onConflict: "date" },
      );
    }
  }
  return map;
}

async function resolveMetaTokens(
  admin: ReturnType<typeof createClient>,
  bodyToken: string | null | undefined,
): Promise<string[]> {
  if (bodyToken?.trim()) return [bodyToken.trim()];
  const out: string[] = [];
  const { data: tokens } = await admin
    .from("meta_tokens")
    .select("access_token")
    .order("created_at", { ascending: true });
  for (const row of tokens ?? []) {
    if (row?.access_token) out.push(row.access_token as string);
  }
  if (out.length === 0) {
    const { data: settings } = await admin
      .from("automation_settings")
      .select("meta_access_token")
      .eq("id", true)
      .maybeSingle();
    const legacy = (settings as { meta_access_token?: string | null } | null)?.meta_access_token;
    if (legacy) out.push(legacy);
  }
  if (out.length === 0) {
    const env = Deno.env.get("META_ACCESS_TOKEN");
    if (env) out.push(env);
  }
  // де-дуп
  return Array.from(new Set(out));
}

async function resolveMetaToken(
  admin: ReturnType<typeof createClient>,
  bodyToken: string | null | undefined,
): Promise<string | null> {
  const all = await resolveMetaTokens(admin, bodyToken);
  return all[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const adminPre = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: Record<string, unknown> = {};
    if (req.method === "POST") body = await req.json().catch(() => ({}));

    if (body.list_ad_accounts === true) {
      const auth = await requireUser(req);
      if (!auth.ok) return auth.response;

      const excludeRaw: string[] = Array.isArray(body.exclude_act_ids)
        ? body.exclude_act_ids
        : [];
      const exclude = excludeRaw.map((x) => normalizeActIdList(String(x)));
      const token = await resolveMetaToken(
        adminPre,
        typeof body.access_token === "string" ? body.access_token : null,
      );
      if (!token) {
        return new Response(JSON.stringify({
          error: "Meta access token не настроен. Укажите токен в Настройках → Автоматизация.",
          accounts: [],
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const fetched = await fetchAllMetaAdAccounts(token);
      const accounts = mapAdAccounts(fetched.rows, exclude);
      return new Response(JSON.stringify({
        ok: true,
        accounts,
        meta_hint: fetched.meta_hint,
        token_identity: fetched.token_identity,
        sources: fetched.sources,
        raw_count: fetched.rows.length,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Allow internal cron call via shared secret OR require admin user JWT.
    // Поддерживаем оба варианта аутентификации:
    //   1) META_SYNC_CRON_KEY + x-cron-key — для отдельного ключа функции.
    //   2) automation_settings.cron_secret + x-automation-key — единый ключ для
    //      всех cron-задач (тот же, что использует crm-automations). Это решает
    //      401 при срабатывании cron meta-daily-sync-daily, когда отдельный
    //      env-secret не задан.
    let isCron = false;
    const envCronKey = Deno.env.get("META_SYNC_CRON_KEY");
    const envCronHeader = req.headers.get("x-cron-key");
    if (envCronKey && envCronHeader === envCronKey) {
      isCron = true;
    } else {
      const automationKey = req.headers.get("x-automation-key");
      if (automationKey) {
        const { data: settings } = await adminPre
          .from("automation_settings")
          .select("cron_secret")
          .eq("id", true)
          .maybeSingle();
        const dbSecret = (settings as { cron_secret?: string | null } | null)?.cron_secret ?? null;
        if (dbSecret && automationKey === dbSecret) isCron = true;
      }
    }
    if (!isCron) {
      const auth = await requireUser(req);
      if (!auth.ok) return auth.response;
      if (!(await userHasRole(auth.userId, "admin"))) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const META_TOKENS = await resolveMetaTokens(adminPre, null);
    if (META_TOKENS.length === 0) {
      return new Response(JSON.stringify({ error: "Meta access token не настроен (Настройки → Facebook / Meta)." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = adminPre;

    // Read params: date | since/until | cabinet_id (from query OR JSON body).
    // `body` уже распарсен выше (строка 151), здесь только новые поля.
    const url = new URL(req.url);
    const qpDate = url.searchParams.get("date") ?? (body.date as string | undefined) ?? null;
    const qpSince = url.searchParams.get("since") ?? (body.since as string | undefined) ?? null;
    const qpUntil = url.searchParams.get("until") ?? (body.until as string | undefined) ?? null;
    const qpCabinetId = url.searchParams.get("cabinet_id") ?? (body.cabinet_id as string | undefined) ?? null;

    const isYmd = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

    let since: string;
    let until: string;
    if (isYmd(qpSince) && isYmd(qpUntil)) {
      since = qpSince!;
      until = qpUntil!;
    } else if (isYmd(qpDate)) {
      since = qpDate!;
      until = qpDate!;
    } else {
      const yesterdayAlmaty = addDaysYmd(ymdInTimeZone(new Date(), "Asia/Almaty"), -1);
      since = until = yesterdayAlmaty;
    }
    if (since > until) [since, until] = [until, since];

    let cabQuery = admin.from("ad_cabinets").select("id, external_id, project_id, name");
    if (qpCabinetId) cabQuery = cabQuery.eq("id", qpCabinetId);
    const { data: cabinets, error: cabErr } = await cabQuery;
    if (cabErr) throw cabErr;

    const results: Array<Record<string, unknown>> = [];

    // Простой retry для транзитных ошибок Meta API: 3 попытки с экспоненциальным backoff.
    // Это закрывает основную причину "не всегда синхронизируется" — сеть/rate-limit.
    async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
      let lastErr: unknown = null;
      for (let i = 0; i < attempts; i++) {
        try {
          const r = await fetch(url);
          // Retry на 429 (rate limit) и 5xx (transient server errors). 4xx (кроме 429) — клиентская ошибка, не ретраим.
          if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) return r;
          lastErr = new Error(`HTTP ${r.status}`);
        } catch (e) {
          lastErr = e;
        }
        if (i < attempts - 1) await new Promise((res) => setTimeout(res, 500 * Math.pow(2, i)));
      }
      throw lastErr ?? new Error("fetch failed after retries");
    }

    for (const cab of cabinets ?? []) {
      const ext = (cab.external_id ?? "").trim();
      const cabName = (cab as { name?: string }).name ?? ext;
      if (!ext) {
        // Раньше тихо пропускали — теперь явно логируем, чтобы было видно неконфигурированные кабинеты.
        results.push({ cabinet_id: cab.id, cabinet: cabName, ok: false, error: "external_id (ad_account_id) не задан" });
        console.warn(`[meta-daily-sync] cabinet=${cab.id} skipped: external_id empty`);
        continue;
      }
      const actId = normalizeActId(ext);

      // Кампанийный уровень: иначе Meta смешивает WhatsApp-переписки в lead на аккаунте.
      const fields = ["campaign_id", "date_start", "spend", "impressions", "clicks", "actions", "action_values"].join(",");
      const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
      const buildInsightsUrl = (tok: string) =>
        `https://graph.facebook.com/${META_API_VERSION}/${actId}/insights` +
        `?fields=${fields}&time_range=${timeRange}&time_increment=1&level=campaign&limit=500` +
        `&access_token=${encodeURIComponent(tok)}`;
      const buildAccountUrl = (tok: string) =>
        `https://graph.facebook.com/${META_API_VERSION}/${actId}` +
        `?fields=currency&access_token=${encodeURIComponent(tok)}`;
      const buildAdsetsUrl = (tok: string) =>
        `https://graph.facebook.com/${META_API_VERSION}/${actId}/adsets` +
        `?fields=campaign_id,destination_type,optimization_goal&limit=200&access_token=${encodeURIComponent(tok)}`;
      const buildCampaignsUrl = (tok: string) =>
        `https://graph.facebook.com/${META_API_VERSION}/${actId}/campaigns` +
        `?fields=id,name,objective&limit=200&access_token=${encodeURIComponent(tok)}`;

      try {
        // Перебираем все Meta токены, пока какой-нибудь не получит доступ к кабинету.
        let workingTok: string | null = null;
        let aJson: Record<string, unknown> = {};
        let lastErr: { msg: string; code?: unknown } | null = null;
        for (const tok of META_TOKENS) {
          const ar = await fetchWithRetry(buildAccountUrl(tok));
          const aj = await ar.json().catch(() => ({}));
          if (ar.ok) {
            workingTok = tok;
            aJson = aj as Record<string, unknown>;
            break;
          }
          lastErr = { msg: (aj as { error?: { message?: string; code?: unknown } })?.error?.message ?? `HTTP ${ar.status}`, code: (aj as { error?: { code?: unknown } })?.error?.code };
        }
        if (!workingTok) {
          results.push({ cabinet_id: cab.id, cabinet: cabName, ok: false, error: lastErr?.msg ?? "no token has access", code: lastErr?.code });
          console.error(`[meta-daily-sync] cabinet=${ext} no token has access: ${lastErr?.msg}`);
          continue;
        }
        const accountCurrency: string = (aJson?.currency as string) ?? "USD";

        type CampMeta = {
          dest: string | null;
          objective: string | null;
          optGoal: string | null;
          name: string | null;
        };
        const campMeta = new Map<string, CampMeta>();

        try {
          const [adsets, camps] = await Promise.all([
            fetchAllPages<Record<string, unknown>>(buildAdsetsUrl(workingTok), fetchWithRetry),
            fetchAllPages<Record<string, unknown>>(buildCampaignsUrl(workingTok), fetchWithRetry),
          ]);
          for (const c of camps) {
            const cid = String(c.id ?? "");
            if (!cid) continue;
            campMeta.set(cid, {
              dest: null,
              objective: (c.objective as string | undefined) ?? null,
              optGoal: null,
              name: (c.name as string | undefined) ?? null,
            });
          }
          for (const a of adsets) {
            const cid = String(a.campaign_id ?? "");
            if (!cid) continue;
            const cur = campMeta.get(cid) ?? { dest: null, objective: null, optGoal: null, name: null };
            if (!cur.dest && a.destination_type) cur.dest = String(a.destination_type);
            if (!cur.optGoal && a.optimization_goal) cur.optGoal = String(a.optimization_goal);
            campMeta.set(cid, cur);
          }
        } catch (e) {
          console.warn(`[meta-daily-sync] cabinet=${ext} campaign meta fetch failed:`, e);
        }
        // Фоллбэк: уже сохранённые meta_campaigns
        if (campMeta.size === 0) {
          const { data: camps } = await admin
            .from("meta_campaigns")
            .select("campaign_id, destination_type, objective, name")
            .eq("cabinet_id", cab.id);
          for (const c of camps ?? []) {
            campMeta.set(String(c.campaign_id), {
              dest: (c as { destination_type?: string | null }).destination_type ?? null,
              objective: (c as { objective?: string | null }).objective ?? null,
              optGoal: null,
              name: (c as { name?: string | null }).name ?? null,
            });
          }
        }

        const campRows = await fetchAllPages<Record<string, unknown>>(
          buildInsightsUrl(workingTok),
          fetchWithRetry,
        );

        // Агрегат по дню: клики отдельно, WA → messages, сайт/формы → leads
        type DayAgg = {
          spend: number; impressions: number; clicks: number;
          leads: number; messages: number; revenue: number;
        };
        const byDate = new Map<string, DayAgg>();
        let totalSpend = 0, totalLeads = 0, totalMessages = 0, totalClicks = 0, totalRevenue = 0;

        for (const row of campRows) {
          const date = String(row?.date_start ?? "");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          const campaignId = String(row?.campaign_id ?? "");
          const meta = campMeta.get(campaignId);
          const spend = Number(row?.spend ?? 0);
          const impressions = Number(row?.impressions ?? 0);
          const clicks = Number(row?.clicks ?? 0);
          const { leads, messages } = splitLeadsAndMessages(
            row?.actions as MetaAction[] | undefined,
            meta?.dest,
            meta?.objective,
            meta?.optGoal,
            meta?.name,
          );
          const revenue = sumActions(row?.action_values as MetaAction[] | undefined, PURCHASE_ACTIONS);

          const cur = byDate.get(date) ?? {
            spend: 0, impressions: 0, clicks: 0, leads: 0, messages: 0, revenue: 0,
          };
          cur.spend += spend;
          cur.impressions += impressions;
          cur.clicks += clicks;
          cur.leads += leads;
          cur.messages += messages;
          cur.revenue += revenue;
          byDate.set(date, cur);

          totalSpend += spend;
          totalLeads += leads;
          totalMessages += messages;
          totalClicks += clicks;
          totalRevenue += revenue;
        }

        const rows: Array<Record<string, unknown>> = [];
        for (const [date, agg] of byDate) {
          const cpl = agg.leads > 0 ? agg.spend / agg.leads : 0;
          const cpm = agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0;
          const cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
          const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
          rows.push({
            cabinet_id: cab.id,
            external_id: actId,
            project_id: (cab as { project_id?: string | null }).project_id ?? null,
            date,
            spend: agg.spend,
            impressions: agg.impressions,
            clicks: agg.clicks,
            leads: agg.leads,
            messages: agg.messages,
            revenue: agg.revenue,
            cpl, cpm, cpc, ctr,
            currency: accountCurrency,
            synced_at: new Date().toISOString(),
          });
        }
        if (rows.length > 0) {
          const { error: upErr } = await admin
            .from("cabinet_daily_insights")
            .upsert(rows, { onConflict: "external_id,date" });
          if (upErr) {
            results.push({ cabinet_id: cab.id, cabinet: cabName, ok: false, error: upErr.message });
            console.error(`[meta-daily-sync] cabinet=${ext} upsert error: ${upErr.message}`);
            continue;
          }
        }
        results.push({
          cabinet_id: cab.id, cabinet: cabName, ok: true,
          since, until, days: rows.length,
          spend: totalSpend, leads: totalLeads, messages: totalMessages, clicks: totalClicks, revenue: totalRevenue,
        });
        console.log(
          `[meta-daily-sync] cabinet=${ext} project=${(cab as any).project_id ?? "—"} ` +
          `range=${since}..${until} days=${rows.length} spend=${totalSpend.toFixed(2)} ` +
          `leads=${totalLeads} messages=${totalMessages} clicks=${totalClicks} revenue=${totalRevenue.toFixed(2)}`,
        );
      } catch (e) {
        results.push({ cabinet_id: cab.id, cabinet: cabName, ok: false, error: (e as Error).message });
        console.error(`[meta-daily-sync] cabinet=${ext} fatal:`, e);
      }
    }

    // Сводный summary в лог, чтобы было видно в supabase logs какие кабинеты упали.
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    console.log(`[meta-daily-sync] summary: ${okCount} ok, ${failCount} failed, range ${since}..${until}`);

    // Журналируем каждый прогон в ad_sync_runs (один INSERT на кабинет), чтобы UI
    // мог показать last_sync_status / последние ошибки без копания в edge logs.
    if (results.length > 0) {
      const logRows = results.map((r) => ({
        provider: "meta",
        cabinet_id: (r as { cabinet_id?: string }).cabinet_id ?? null,
        external_id: typeof (r as { cabinet?: string }).cabinet === "string"
          ? (r as { cabinet?: string }).cabinet
          : null,
        since,
        until,
        ok: !!(r as { ok?: boolean }).ok,
        days: Number((r as { days?: number }).days ?? 0),
        spend: Number((r as { spend?: number }).spend ?? 0),
        leads: Number((r as { leads?: number }).leads ?? 0),
        clicks: Number((r as { clicks?: number }).clicks ?? 0),
        revenue: Number((r as { revenue?: number }).revenue ?? 0),
        error: (r as { error?: string }).error ?? null,
        error_code: (r as { code?: string | number }).code != null ? String((r as { code?: string | number }).code) : null,
        triggered_by: isCron ? "cron" : "manual",
      }));
      // best-effort: если таблицы ещё нет — не валим всю синхронизацию.
      const { error: logErr } = await admin.from("ad_sync_runs").insert(logRows);
      if (logErr) console.warn(`[meta-daily-sync] ad_sync_runs insert failed: ${logErr.message}`);
    }

    return new Response(JSON.stringify({ since, until, count: results.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
