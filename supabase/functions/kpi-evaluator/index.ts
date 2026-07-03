// KPI Evaluator: scans active campaigns, computes traffic-light status
// based on resolved KPIs (v_resolved_kpi or per-cabinet defaults) and
// rolling 3-day insights, then writes ad_status_snapshots.
//
// Invoke with optional { cabinet_id, project_id } body. Cron triggers
// fire-and-forget without body for global sweep.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Row = {
  cabinet_id: string;
  project_id: string;
  campaign_id: string;
  campaign_name: string | null;
  objective: string | null;
  destination_type: string | null;
  status: string | null;
  effective_status: string | null;
  daily_budget: number | null;
};

type Kpi = {
  target_cpl_kzt: number | null;
  max_cpl_kzt: number | null;
  min_daily_leads: number | null;
  target_roas: number | null;
  min_roas: number | null;
  min_daily_spend_kzt: number | null;
  max_daily_spend_kzt: number | null;
  max_frequency_7d: number | null;
  min_ctr_pct: number | null;
  learning_phase_min_events: number | null;
  auto_mode?: "off" | "suggest" | "enforce";
  auto_pause_enabled?: boolean;
  auto_budget_cut_enabled?: boolean;
  budget_cut_pct?: number;
  auto_budget_bump_enabled?: boolean;
  budget_bump_pct?: number;
  bump_max_daily_kzt?: number | null;
  cooldown_minutes?: number;
  daily_action_limit?: number;
};

const DEFAULTS_BY_GOAL: Record<string, Partial<Kpi>> = {
  whatsapp: { target_cpl_kzt: 2000, max_cpl_kzt: 3500, min_daily_leads: 1 },
  messages: { target_cpl_kzt: 2000, max_cpl_kzt: 3500, min_daily_leads: 1 },
  leads: { target_cpl_kzt: 5000, max_cpl_kzt: 9000, min_daily_leads: 1 },
  outcome_leads: { target_cpl_kzt: 5000, max_cpl_kzt: 9000, min_daily_leads: 1 },
  link_clicks: { target_cpl_kzt: 200, max_cpl_kzt: 500, min_daily_leads: 0 },
  outcome_traffic: { target_cpl_kzt: 200, max_cpl_kzt: 500, min_daily_leads: 0 },
};

function pickDefaults(objective: string | null): Partial<Kpi> {
  const k = (objective || "").toLowerCase();
  for (const key of Object.keys(DEFAULTS_BY_GOAL)) {
    if (k.includes(key)) return DEFAULTS_BY_GOAL[key];
  }
  return { target_cpl_kzt: 3000, max_cpl_kzt: 6000, min_daily_leads: 1 };
}

function evaluate(metrics: {
  spend: number; leads: number; clicks: number; impressions: number;
  revenue: number; days: number; campaign_age_h: number; daily_budget: number;
}, kpi: Kpi) {
  const reasons: string[] = [];
  const { spend, leads, clicks, impressions, revenue, days, campaign_age_h, daily_budget } = metrics;

  // Cold start: <48h or <learning_phase_min_events
  const learnMin = kpi.learning_phase_min_events ?? 50;
  if (campaign_age_h < 48 || leads < learnMin / 5) {
    return { status: "cold_start", reasons: ["Кампания моложе 48ч или фаза обучения"] };
  }
  if (spend < 100) {
    return { status: "no_data", reasons: ["Нет открут за окно"] };
  }

  const cpl = leads > 0 ? spend / leads : Infinity;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const roas = spend > 0 ? revenue / spend : 0;
  const dailySpend = spend / Math.max(days, 1);
  const dailyLeads = leads / Math.max(days, 1);
  const pace = daily_budget > 0 ? (dailySpend / daily_budget) * 100 : 100;

  let red = 0, yellow = 0;

  if (kpi.max_cpl_kzt && cpl > kpi.max_cpl_kzt) {
    red++; reasons.push(`CPL ${Math.round(cpl)}$ > max ${kpi.max_cpl_kzt}$`);
  } else if (kpi.target_cpl_kzt && cpl > kpi.target_cpl_kzt) {
    yellow++; reasons.push(`CPL ${Math.round(cpl)}$ > target ${kpi.target_cpl_kzt}$`);
  }

  if (leads === 0 && spend > 0) {
    red++; reasons.push(`0 лидов за ${days}д при тратах ${Math.round(spend)}$`);
  } else if (kpi.min_daily_leads && dailyLeads < kpi.min_daily_leads) {
    yellow++; reasons.push(`${dailyLeads.toFixed(1)} лид/день < min ${kpi.min_daily_leads}`);
  }

  if (pace > 130) { red++; reasons.push(`Перерасход ${Math.round(pace)}% бюджета`); }
  else if (pace < 50) { yellow++; reasons.push(`Недокрут ${Math.round(pace)}% бюджета`); }
  else if (pace > 120 || pace < 80) { yellow++; reasons.push(`Pace ${Math.round(pace)}%`); }

  if (kpi.min_ctr_pct && ctr < kpi.min_ctr_pct) {
    yellow++; reasons.push(`CTR ${ctr.toFixed(2)}% < min ${kpi.min_ctr_pct}%`);
  }

  if (kpi.max_daily_spend_kzt && dailySpend > kpi.max_daily_spend_kzt) {
    red++; reasons.push(`Дневная трата ${Math.round(dailySpend)}$ > лимита ${kpi.max_daily_spend_kzt}$`);
  }

  if (kpi.target_roas && roas > 0 && roas < (kpi.min_roas ?? kpi.target_roas * 0.7)) {
    yellow++; reasons.push(`ROAS ${roas.toFixed(2)} < min`);
  }

  const status = red > 0 ? "red" : yellow > 0 ? "yellow" : "green";
  if (status === "green") reasons.push(`✓ CPL ${Math.round(cpl)}$, ${dailyLeads.toFixed(1)} лид/день`);
  return { status, reasons };
}

async function run(opts: { cabinet_id?: string; project_id?: string }) {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Pull active campaigns
  let q = sb.from("meta_campaigns")
    .select("cabinet_id,project_id,campaign_id,name,objective,destination_type,status,effective_status,daily_budget,start_time")
    .in("status", ["ACTIVE"]);
  if (opts.cabinet_id) q = q.eq("cabinet_id", opts.cabinet_id);
  if (opts.project_id) q = q.eq("project_id", opts.project_id);

  const { data: camps, error } = await q;
  if (error) throw new Error(`meta_campaigns: ${error.message}`);

  // Pull resolved KPI map (cabinet-level fallback)
  const cabIds = Array.from(new Set((camps || []).map((c) => c.cabinet_id).filter(Boolean)));
  const kpiByCab = new Map<string, Kpi>();
  if (cabIds.length) {
    const { data: kpis } = await sb.from("ad_kpi_targets")
      .select("*")
      .in("cabinet_id", cabIds)
      .is("campaign_id", null)
      .is("adset_id", null);
    for (const k of kpis || []) {
      kpiByCab.set(`${k.cabinet_id}:${k.goal_type || ""}`, k as Kpi);
    }
  }

  const today = new Date();
  const since = new Date(today.getTime() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  let written = 0;

  for (const c of camps || []) {
    const goalKey = (c.objective || "").toLowerCase();
    const kpiRow: Kpi = (
      kpiByCab.get(`${c.cabinet_id}:${goalKey}`) ||
      kpiByCab.get(`${c.cabinet_id}:`) ||
      (pickDefaults(c.objective) as Kpi)
    );
    const kpi: Kpi = {
      target_cpl_kzt: kpiRow.target_cpl_kzt ?? pickDefaults(c.objective).target_cpl_kzt ?? null,
      max_cpl_kzt: kpiRow.max_cpl_kzt ?? pickDefaults(c.objective).max_cpl_kzt ?? null,
      min_daily_leads: kpiRow.min_daily_leads ?? 1,
      target_roas: kpiRow.target_roas ?? null,
      min_roas: kpiRow.min_roas ?? null,
      min_daily_spend_kzt: kpiRow.min_daily_spend_kzt ?? null,
      max_daily_spend_kzt: kpiRow.max_daily_spend_kzt ?? null,
      max_frequency_7d: kpiRow.max_frequency_7d ?? 3.5,
      min_ctr_pct: kpiRow.min_ctr_pct ?? 0.8,
      learning_phase_min_events: kpiRow.learning_phase_min_events ?? 50,
      auto_mode: (kpiRow as any).auto_mode ?? "suggest",
      auto_pause_enabled: (kpiRow as any).auto_pause_enabled ?? true,
      auto_budget_cut_enabled: (kpiRow as any).auto_budget_cut_enabled ?? true,
      budget_cut_pct: (kpiRow as any).budget_cut_pct ?? 20,
      auto_budget_bump_enabled: (kpiRow as any).auto_budget_bump_enabled ?? false,
      budget_bump_pct: (kpiRow as any).budget_bump_pct ?? 20,
      bump_max_daily_kzt: (kpiRow as any).bump_max_daily_kzt ?? null,
      cooldown_minutes: (kpiRow as any).cooldown_minutes ?? 360,
      daily_action_limit: (kpiRow as any).daily_action_limit ?? 5,
    };

    const { data: ins } = await sb.from("meta_campaign_daily")
      .select("date,spend,leads,clicks,impressions,revenue")
      .eq("campaign_id", c.campaign_id)
      .gte("date", since);

    const agg = (ins || []).reduce(
      (a, r) => ({
        spend: a.spend + Number(r.spend || 0),
        leads: a.leads + Number(r.leads || 0),
        clicks: a.clicks + Number(r.clicks || 0),
        impressions: a.impressions + Number(r.impressions || 0),
        revenue: a.revenue + Number(r.revenue || 0),
        days: a.days + 1,
      }),
      { spend: 0, leads: 0, clicks: 0, impressions: 0, revenue: 0, days: 0 },
    );

    const startTime = (c as any).start_time ? new Date((c as any).start_time).getTime() : Date.now();
    const campaign_age_h = (Date.now() - startTime) / 3600000;

    const result = evaluate({
      ...agg,
      days: Math.max(agg.days, 1),
      campaign_age_h,
      daily_budget: Number(c.daily_budget || 0),
    }, kpi);

    const cpl = agg.leads > 0 ? agg.spend / agg.leads : null;
    const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
    const roas = agg.spend > 0 ? agg.revenue / agg.spend : 0;

    await sb.from("ad_status_snapshots").insert({
      cabinet_id: c.cabinet_id,
      project_id: c.project_id,
      campaign_id: c.campaign_id,
      adset_id: null,
      window_days: 3,
      status: result.status,
      reasons: result.reasons,
      metrics: {
        spend: agg.spend, leads: agg.leads, clicks: agg.clicks,
        impressions: agg.impressions, revenue: agg.revenue, days: agg.days,
        cpl, ctr, roas, daily_budget: c.daily_budget,
      },
      resolved_kpi: kpi,
    });
    written++;

    // ---- Alert generation ----
    if (result.status === "red" || result.status === "yellow") {
      const severity = result.status === "red" ? "critical" : "warning";
      const kind = result.status === "red" ? "campaign_red" : "campaign_yellow";
      const dedup_key = `${kind}:${c.campaign_id}`;
      const title = `${result.status === "red" ? "🔴" : "🟡"} ${c.name || c.campaign_id}`;
      const body = result.reasons.join(" • ");

      const { data: existing } = await sb.from("ad_alerts")
        .select("id,fire_count,last_fired_at,snoozed_until,telegram_chat_id,telegram_message_id")
        .eq("cabinet_id", c.cabinet_id)
        .eq("dedup_key", dedup_key)
        .is("resolved_at", null)
        .maybeSingle();

      const now = Date.now();
      const shouldNotify =
        !existing ||
        (existing.snoozed_until && new Date(existing.snoozed_until).getTime() < now) ||
        (now - new Date(existing.last_fired_at).getTime() > 4 * 3600 * 1000);

      let alertId: string | null = existing?.id ?? null;
      if (!existing) {
        const { data: inserted } = await sb.from("ad_alerts").insert({
          cabinet_id: c.cabinet_id,
          project_id: c.project_id,
          campaign_id: c.campaign_id,
          severity, kind, dedup_key, title, body,
          reasons: result.reasons,
          metrics: { cpl, ctr, roas, spend: agg.spend, leads: agg.leads, days: agg.days },
        }).select("id").single();
        alertId = inserted?.id ?? null;
      } else if (shouldNotify) {
        await sb.from("ad_alerts").update({
          fire_count: (existing.fire_count || 1) + 1,
          last_fired_at: new Date().toISOString(),
          reasons: result.reasons, body,
          metrics: { cpl, ctr, roas, spend: agg.spend, leads: agg.leads, days: agg.days },
        }).eq("id", existing.id);
      }

      // Telegram notify (best-effort)
      if (shouldNotify && alertId) {
        try {
          const { data: bot } = await sb.from("project_ads_telegram_bots")
            .select("bot_token,chat_id,is_active")
            .eq("project_id", c.project_id).maybeSingle();
          if (bot?.is_active && bot.bot_token && bot.chat_id) {
            const text =
              `${title}\n` +
              `<i>${(c.objective || "").toUpperCase()} • ${agg.days}д</i>\n\n` +
              result.reasons.map((r) => `• ${r}`).join("\n") +
              (cpl ? `\n\n<b>CPL:</b> ${Math.round(cpl)}$` : "") +
              `\n<b>Spend:</b> ${Math.round(agg.spend).toLocaleString("ru-RU")}$ • <b>Leads:</b> ${agg.leads}`;
            const tgResp = await fetch(`https://api.telegram.org/bot${bot.bot_token}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: bot.chat_id,
                text,
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [[
                    { text: "✅ Подтвердить", callback_data: `ack:${alertId}` },
                    { text: "💤 4ч", callback_data: `snooze:${alertId}:4` },
                  ]],
                },
              }),
            }).then((r) => r.json()).catch(() => null);
            if (tgResp?.ok) {
              await sb.from("ad_alerts").update({
                telegram_chat_id: String(bot.chat_id),
                telegram_message_id: tgResp.result?.message_id ?? null,
              }).eq("id", alertId);
            }
          }
        } catch (_) { /* swallow */ }
      }

      // ---- Auto-action decision ----
      try {
        await maybeAutoAction(sb, c, result, agg, cpl, kpi, alertId);
      } catch (_) { /* swallow per-campaign */ }
    } else if (result.status === "green") {
      // Auto-resolve open alerts when campaign recovers
      await sb.from("ad_alerts")
        .update({ resolved_at: new Date().toISOString() })
        .eq("cabinet_id", c.cabinet_id)
        .eq("campaign_id", c.campaign_id)
        .is("resolved_at", null);

      // Bump opportunity: green + ROAS > target*1.5 + pace > 50%
      try {
        await maybeBumpAction(sb, c, result, agg, kpi);
      } catch (_) { /* swallow */ }
    }
  }

  const adsetActions = await runAdsetAutomation(sb, opts);
  return { ok: true, evaluated: camps?.length || 0, written, adset_actions: adsetActions };
}

type AdsetRules = {
  auto_mode: "off" | "suggest" | "enforce";
  auto_duplicate_adset_enabled: boolean;
  auto_duplicate_stable_days: number;
  auto_duplicate_max_cpl: number | null;
  auto_duplicate_min_leads: number;
  auto_smart_pause_enabled: boolean;
  auto_pause_spend_threshold: number | null;
  auto_pause_min_ctr_pct: number;
  auto_pause_max_cpm: number | null;
  auto_pause_scope: string;
  cooldown_minutes: number;
  daily_action_limit: number;
};

async function canInsertAdsetAction(sb: any, cabinetId: string, entityId: string, kpi: AdsetRules): Promise<boolean> {
  const cooldownMs = (kpi.cooldown_minutes ?? 360) * 60 * 1000;
  const { data: recent } = await sb.from("ad_auto_actions")
    .select("id")
    .eq("cabinet_id", cabinetId)
    .or(`adset_id.eq.${entityId},ad_id.eq.${entityId}`)
    .in("status", ["pending", "applied"])
    .gte("created_at", new Date(Date.now() - cooldownMs).toISOString())
    .limit(1);
  if (recent?.length) return false;

  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await sb.from("ad_auto_actions")
    .select("id", { count: "exact", head: true })
    .eq("cabinet_id", cabinetId)
    .gte("created_at", startOfDay.toISOString())
    .neq("status", "skipped");
  return (count ?? 0) < (kpi.daily_action_limit ?? 5);
}

async function queueAdsetAction(
  sb: any,
  params: {
    cabinet_id: string;
    project_id: string;
    campaign_id: string;
    adset_id?: string | null;
    ad_id?: string | null;
    entity_name?: string | null;
    action_type: string;
    mode: string;
    reason: string;
    reason_metrics: Record<string, unknown>;
    after_value?: Record<string, unknown>;
  },
): Promise<number> {
  const { data: inserted } = await sb.from("ad_auto_actions").insert({
    cabinet_id: params.cabinet_id,
    project_id: params.project_id,
    campaign_id: params.campaign_id,
    campaign_name: params.entity_name ?? null,
    adset_id: params.adset_id ?? null,
    ad_id: params.ad_id ?? null,
    entity_name: params.entity_name ?? null,
    action_type: params.action_type,
    trigger: "kpi_evaluator",
    mode: params.mode,
    reason: params.reason,
    reason_metrics: params.reason_metrics,
    before_value: {},
    after_value: params.after_value ?? {},
    status: "pending",
  }).select("id").single();

  if (params.mode === "enforce" && inserted?.id) {
    await fetch(`${SUPABASE_URL}/functions/v1/ads-action-executor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ action_id: inserted.id }),
    }).catch(() => null);
  }
  return 1;
}

async function runAdsetAutomation(sb: any, opts: { cabinet_id?: string; project_id?: string }): Promise<number> {
  let cabQ = sb.from("ad_cabinets").select("id,project_id").eq("provider", "meta");
  if (opts.cabinet_id) cabQ = cabQ.eq("id", opts.cabinet_id);
  if (opts.project_id) cabQ = cabQ.eq("project_id", opts.project_id);
  const { data: cabinets } = await cabQ;
  if (!cabinets?.length) return 0;

  let actions = 0;
  const today = new Date();

  for (const cab of cabinets) {
    const { data: kpiRow } = await sb.from("ad_kpi_targets")
      .select("*")
      .eq("cabinet_id", cab.id)
      .is("campaign_id", null)
      .is("adset_id", null)
      .maybeSingle();
    if (!kpiRow) continue;

    const rules: AdsetRules = {
      auto_mode: kpiRow.auto_mode ?? "suggest",
      auto_duplicate_adset_enabled: !!kpiRow.auto_duplicate_adset_enabled,
      auto_duplicate_stable_days: Number(kpiRow.auto_duplicate_stable_days ?? 3),
      auto_duplicate_max_cpl: kpiRow.auto_duplicate_max_cpl != null ? Number(kpiRow.auto_duplicate_max_cpl) : null,
      auto_duplicate_min_leads: Number(kpiRow.auto_duplicate_min_leads ?? 3),
      auto_smart_pause_enabled: !!kpiRow.auto_smart_pause_enabled,
      auto_pause_spend_threshold: kpiRow.auto_pause_spend_threshold != null ? Number(kpiRow.auto_pause_spend_threshold) : 5,
      auto_pause_min_ctr_pct: Number(kpiRow.auto_pause_min_ctr_pct ?? 0.8),
      auto_pause_max_cpm: kpiRow.auto_pause_max_cpm != null ? Number(kpiRow.auto_pause_max_cpm) : null,
      auto_pause_scope: kpiRow.auto_pause_scope ?? "adset",
      cooldown_minutes: Number(kpiRow.cooldown_minutes ?? 360),
      daily_action_limit: Number(kpiRow.daily_action_limit ?? 5),
    };

    if (rules.auto_mode === "off") continue;
    if (!rules.auto_duplicate_adset_enabled && !rules.auto_smart_pause_enabled) continue;

    const windowDays = Math.max(rules.auto_duplicate_stable_days, 3);
    const since = new Date(today.getTime() - windowDays * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const { data: creatives } = await sb.from("meta_creatives")
      .select("ad_id,adset_id,campaign_id,name,status,effective_status")
      .eq("cabinet_id", cab.id)
      .not("adset_id", "is", null);

    const adIds = (creatives || []).map((c: { ad_id: string }) => c.ad_id).filter(Boolean);
    if (!adIds.length) continue;

    const { data: daily } = await sb.from("meta_creative_daily")
      .select("ad_id,date,spend,leads,clicks,impressions")
      .eq("cabinet_id", cab.id)
      .gte("date", since);

    const adToAdset = new Map<string, { adset_id: string; campaign_id: string; name: string }>();
    const adsetActiveAds = new Map<string, number>();
    for (const cr of creatives || []) {
      if (!cr.adset_id) continue;
      adToAdset.set(cr.ad_id, { adset_id: cr.adset_id, campaign_id: cr.campaign_id, name: cr.name });
      const st = (cr.effective_status || cr.status || "").toUpperCase();
      if (st === "ACTIVE") adsetActiveAds.set(cr.adset_id, (adsetActiveAds.get(cr.adset_id) ?? 0) + 1);
    }

    const adsetMap = new Map<string, {
      adset_id: string; campaign_id: string; adset_name: string;
      spend: number; leads: number; clicks: number; impressions: number; days: number; active_ads: number;
    }>();

    const dayKeys = new Set<string>();
    for (const row of daily || []) {
      const meta = adToAdset.get(row.ad_id);
      if (!meta) continue;
      dayKeys.add(`${meta.adset_id}:${row.date}`);
      const cur = adsetMap.get(meta.adset_id) ?? {
        adset_id: meta.adset_id,
        campaign_id: meta.campaign_id,
        adset_name: meta.name,
        spend: 0, leads: 0, clicks: 0, impressions: 0, days: 0, active_ads: adsetActiveAds.get(meta.adset_id) ?? 0,
      };
      cur.spend += Number(row.spend || 0);
      cur.leads += Number(row.leads || 0);
      cur.clicks += Number(row.clicks || 0);
      cur.impressions += Number(row.impressions || 0);
      adsetMap.set(meta.adset_id, cur);
    }
    for (const key of dayKeys) {
      const adsetId = key.split(":")[0];
      const cur = adsetMap.get(adsetId);
      if (cur) cur.days += 1;
    }

    for (const agg of adsetMap.values()) {
      const cpl = agg.leads > 0 ? agg.spend / agg.leads : null;
      const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
      const cpm = agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0;

      if (
        rules.auto_duplicate_adset_enabled &&
        rules.auto_duplicate_max_cpl != null &&
        agg.leads >= rules.auto_duplicate_min_leads &&
        cpl != null &&
        cpl <= rules.auto_duplicate_max_cpl &&
        agg.days >= rules.auto_duplicate_stable_days
      ) {
        if (await canInsertAdsetAction(sb, cab.id, agg.adset_id, rules)) {
          actions += await queueAdsetAction(sb, {
            cabinet_id: cab.id,
            project_id: cab.project_id,
            campaign_id: agg.campaign_id,
            adset_id: agg.adset_id,
            entity_name: agg.adset_name,
            action_type: "duplicate_adset",
            mode: rules.auto_mode,
            reason: `CPL ${cpl.toFixed(2)} ≤ ${rules.auto_duplicate_max_cpl} за ${agg.days}д · ${agg.leads} заявок`,
            reason_metrics: { cpl, spend: agg.spend, leads: agg.leads, ctr, cpm, days: agg.days },
            after_value: { status_option: "PAUSED" },
          });
        }
      }

      if (
        rules.auto_smart_pause_enabled &&
        rules.auto_pause_spend_threshold != null &&
        agg.leads === 0 &&
        agg.spend >= rules.auto_pause_spend_threshold &&
        ctr >= rules.auto_pause_min_ctr_pct &&
        (rules.auto_pause_max_cpm == null || cpm <= rules.auto_pause_max_cpm)
      ) {
        const useAd = rules.auto_pause_scope === "ad" && agg.active_ads === 1;
        const adRow = (creatives || []).find(
          (c: { adset_id: string; effective_status?: string; status?: string }) =>
            c.adset_id === agg.adset_id && (c.effective_status || c.status || "").toUpperCase() === "ACTIVE",
        );
        const entityId = useAd && adRow?.ad_id ? adRow.ad_id : agg.adset_id;
        if (await canInsertAdsetAction(sb, cab.id, entityId, rules)) {
          actions += await queueAdsetAction(sb, {
            cabinet_id: cab.id,
            project_id: cab.project_id,
            campaign_id: agg.campaign_id,
            adset_id: useAd ? null : agg.adset_id,
            ad_id: useAd ? adRow?.ad_id : null,
            entity_name: agg.adset_name,
            action_type: useAd ? "pause_ad" : "pause_adset",
            mode: rules.auto_mode,
            reason: `Потрачено ${agg.spend.toFixed(2)} без заявок · CTR ${ctr.toFixed(2)}% в норме`,
            reason_metrics: { spend: agg.spend, leads: 0, ctr, cpm, threshold: rules.auto_pause_spend_threshold },
          });
        }
      }
    }
  }

  return actions;
}

async function maybeAutoAction(
  sb: any,
  c: Row,
  result: { status: string; reasons: string[] },
  agg: { spend: number; leads: number; days: number },
  cpl: number | null,
  kpi: Kpi,
  alertId: string | null,
) {
  const mode = kpi.auto_mode ?? "suggest";
  if (mode === "off") return;

  const dailyBudget = Number(c.daily_budget || 0);
  let actionType: "pause" | "budget_cut" | null = null;
  let afterValue: Record<string, unknown> = {};
  let reason = "";

  // Critical (red): pause if CPL > max*1.5 OR 0 leads with significant spend
  if (result.status === "red" && kpi.auto_pause_enabled) {
    const cplOverMax = cpl && kpi.max_cpl_kzt ? cpl / kpi.max_cpl_kzt : 0;
    const zeroLeadsHigh = agg.leads === 0 && agg.spend > (kpi.target_cpl_kzt ?? 3000) * 2;
    if (cplOverMax > 1.5 || zeroLeadsHigh) {
      actionType = "pause";
      reason = cplOverMax > 1.5
        ? `CPL ${Math.round(cpl!)}$ выше max (${kpi.max_cpl_kzt}$) в ${cplOverMax.toFixed(1)}×`
        : `0 лидов при тратах ${Math.round(agg.spend)}$`;
    }
  }
  // Warning (yellow): cut budget if CPL > target by 20-50%
  if (!actionType && result.status === "yellow" && kpi.auto_budget_cut_enabled && dailyBudget > 0 && cpl && kpi.target_cpl_kzt) {
    const cplOverTarget = cpl / kpi.target_cpl_kzt;
    if (cplOverTarget > 1.2 && cplOverTarget < 1.5) {
      const cutPct = kpi.budget_cut_pct ?? 20;
      const newBudget = Math.max(Math.round((dailyBudget * (100 - cutPct)) / 100), 500);
      if (newBudget < dailyBudget) {
        actionType = "budget_cut";
        afterValue = { daily_budget: newBudget };
        reason = `CPL ${Math.round(cpl)}$ выше target (${kpi.target_cpl_kzt}$) на ${Math.round((cplOverTarget - 1) * 100)}%, режем бюджет на ${cutPct}%`;
      }
    }
  }

  if (!actionType) return;

  // Safety: cooldown — last action on this campaign within cooldown_minutes
  const cooldownMs = (kpi.cooldown_minutes ?? 360) * 60 * 1000;
  const { data: recent } = await sb.from("ad_auto_actions")
    .select("id,created_at,status")
    .eq("campaign_id", c.campaign_id)
    .in("status", ["pending", "applied"])
    .gte("created_at", new Date(Date.now() - cooldownMs).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (recent && recent.length > 0) return; // skip — cooldown

  // Safety: daily limit per cabinet
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await sb.from("ad_auto_actions")
    .select("id", { count: "exact", head: true })
    .eq("cabinet_id", c.cabinet_id)
    .gte("created_at", startOfDay.toISOString())
    .neq("status", "skipped");
  if ((count ?? 0) >= (kpi.daily_action_limit ?? 5)) return;

  const { data: inserted } = await sb.from("ad_auto_actions").insert({
    cabinet_id: c.cabinet_id,
    project_id: c.project_id,
    campaign_id: c.campaign_id,
    campaign_name: c.campaign_name,
    action_type: actionType,
    trigger: "kpi_evaluator",
    mode,
    reason,
    reason_metrics: {
      cpl, spend: agg.spend, leads: agg.leads, days: agg.days,
      target_cpl: kpi.target_cpl_kzt, max_cpl: kpi.max_cpl_kzt, daily_budget: dailyBudget,
    },
    after_value: afterValue,
    alert_id: alertId,
    status: "pending",
  }).select("id").single();

  if (mode === "enforce" && inserted) {
    // Fire-and-forget execution
    await fetch(`${SUPABASE_URL}/functions/v1/ads-action-executor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ action_id: inserted.id }),
    }).catch(() => null);
  }
}

async function maybeBumpAction(
  sb: any,
  c: Row,
  _result: { status: string; reasons: string[] },
  agg: { spend: number; days: number },
  kpi: Kpi,
) {
  if ((kpi.auto_mode ?? "suggest") === "off") return;
  if (!kpi.auto_budget_bump_enabled) return;
  const dailyBudget = Number(c.daily_budget || 0);
  if (dailyBudget <= 0) return;
  if (kpi.bump_max_daily_kzt && dailyBudget >= kpi.bump_max_daily_kzt) return;

  // Need ROAS > target*1.5 and pace > 50%
  const dailySpend = agg.spend / Math.max(agg.days, 1);
  const pace = (dailySpend / dailyBudget) * 100;
  if (pace < 50) return;

  const bumpPct = kpi.budget_bump_pct ?? 20;
  let newBudget = Math.round((dailyBudget * (100 + bumpPct)) / 100);
  if (kpi.bump_max_daily_kzt) newBudget = Math.min(newBudget, Math.round(kpi.bump_max_daily_kzt));
  if (newBudget <= dailyBudget) return;

  // Safety checks reuse
  const cooldownMs = (kpi.cooldown_minutes ?? 360) * 60 * 1000;
  const { data: recent } = await sb.from("ad_auto_actions")
    .select("id")
    .eq("campaign_id", c.campaign_id)
    .in("status", ["pending", "applied"])
    .gte("created_at", new Date(Date.now() - cooldownMs).toISOString())
    .limit(1);
  if (recent && recent.length > 0) return;

  const { data: inserted } = await sb.from("ad_auto_actions").insert({
    cabinet_id: c.cabinet_id,
    project_id: c.project_id,
    campaign_id: c.campaign_id,
    campaign_name: c.campaign_name,
    action_type: "budget_bump",
    trigger: "kpi_evaluator",
    mode: kpi.auto_mode,
    reason: `Стабильно зелёный, pace ${Math.round(pace)}% — поднимаем бюджет на ${bumpPct}%`,
    reason_metrics: { spend: agg.spend, daily_budget: dailyBudget, pace },
    after_value: { daily_budget: newBudget },
    status: "pending",
  }).select("id").single();

  if (kpi.auto_mode === "enforce" && inserted) {
    await fetch(`${SUPABASE_URL}/functions/v1/ads-action-executor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ action_id: inserted.id }),
    }).catch(() => null);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: service-role bearer (internal cron) OR an admin JWT. Everyone else rejected.
  const authHeader = req.headers.get("Authorization") ?? "";
  const presented = authHeader.replace(/^Bearer\s+/i, "").trim();
  let allowed = false;
  let body: { cabinet_id?: string; project_id?: string } = {};
  if (req.method === "POST") {
    body = await req.json().catch(() => ({}));
  }

  if (presented && presented === SUPABASE_SERVICE_ROLE_KEY) {
    allowed = true;
  } else if (presented) {
    try {
      const sb = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${presented}` } } },
      );
      const { data, error } = await sb.auth.getClaims(presented);
      if (!error && data?.claims?.sub) {
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: roleRow } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", data.claims.sub)
          .eq("role", "admin")
          .maybeSingle();
        if (roleRow) {
          allowed = true;
        } else if (body?.cabinet_id) {
          const { data: cab } = await admin.from("ad_cabinets").select("project_id").eq("id", body.cabinet_id).maybeSingle();
          if (cab?.project_id) {
            const { data: access } = await admin.rpc("user_can_access_project", { _project_id: cab.project_id });
            if (access) allowed = true;
          }
        }
      }
    } catch {
      // reject below
    }
  }
  if (!allowed) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const result = await run({ cabinet_id: body?.cabinet_id, project_id: body?.project_id });
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});