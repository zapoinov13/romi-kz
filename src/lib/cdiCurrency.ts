import { supabase } from "@/integrations/supabase/client";

/** Meta spend/revenue в cabinet_daily_insights: USD как есть, legacy KZT → USD. */
export async function loadUsdKztRates(dates: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (dates.length === 0) return map;

  const unique = [...new Set(dates)];
  const { data } = await supabase
    .from("fx_rates")
    .select("date, usd_kzt")
    .in("date", unique);
  for (const r of (data ?? []) as Array<{ date: string; usd_kzt: number | string }>) {
    const rate = Number(r.usd_kzt);
    if (rate > 0) map.set(r.date, rate);
  }

  const missing = unique.filter((d) => !map.has(d));
  if (missing.length > 0) {
    const { data: latest } = await supabase
      .from("fx_rates")
      .select("usd_kzt")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fallback = Number(latest?.usd_kzt ?? 0);
    if (fallback > 0) {
      for (const d of missing) map.set(d, fallback);
    }
  }

  return map;
}

export function metaMoneyToUsd(
  amount: number,
  currency: string | null | undefined,
  date: string,
  rates: Map<string, number>,
): number {
  const c = (currency ?? "USD").toUpperCase();
  if (c === "USD" || !amount) return amount;
  if (c === "KZT") {
    const rate = rates.get(date.slice(0, 10));
    if (rate && rate > 0) return amount / rate;
  }
  return amount;
}

export type CdiMoneyRow = {
  date: string;
  spend?: number | string | null;
  revenue?: number | string | null;
  currency?: string | null;
};

/** Конвертирует только Meta-поля (spend, pixel revenue). CRM-поля не трогаем. */
export function normalizeCdiMetaMoney<T extends CdiMoneyRow>(
  row: T,
  rates: Map<string, number>,
): T {
  const cur = (row.currency ?? "USD").toUpperCase();
  if (cur !== "KZT") return row;
  const date = row.date.slice(0, 10);
  const spend = Number(row.spend ?? 0);
  const revenue = Number(row.revenue ?? 0);
  return {
    ...row,
    spend: metaMoneyToUsd(spend, cur, date, rates),
    revenue: metaMoneyToUsd(revenue, cur, date, rates),
    currency: "USD",
  };
}

export async function normalizeCdiRowsMetaMoney<T extends CdiMoneyRow>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const dates = rows.map((r) => r.date.slice(0, 10));
  const rates = await loadUsdKztRates(dates);
  const hasKzt = rows.some((r) => (r.currency ?? "USD").toUpperCase() === "KZT");
  if (!hasKzt) return rows;
  return rows.map((r) => normalizeCdiMetaMoney(r, rates));
}
