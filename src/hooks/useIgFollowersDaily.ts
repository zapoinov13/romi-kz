import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Pulls Instagram per-day follower growth for the active project from
 * `instagram_account_daily`. Returns a Map<isoDate, newFollowers>.
 */
export function useIgFollowersDaily(
  projectId: string | null | undefined,
  month: string, // "YYYY-MM"
) {
  const [byDate, setByDate] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setByDate(new Map());
      return;
    }
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) return;
    const year = Number(m[1]);
    const idx = Number(m[2]) - 1;
    const since = new Date(Date.UTC(year, idx, 1)).toISOString().slice(0, 10);
    const until = new Date(Date.UTC(year, idx + 1, 0)).toISOString().slice(0, 10);

    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("instagram_account_daily")
        .select("date, new_followers")
        .eq("project_id", projectId)
        .gte("date", since)
        .lte("date", until)
        .order("date", { ascending: true });
      if (cancelled) return;
      if (error || !data) {
        setByDate(new Map());
        setLoading(false);
        return;
      }
      const map = new Map<string, number>();
      for (const r of data as Array<{ date: string; new_followers: number | null }>) {
        map.set(r.date, Math.max(0, Number(r.new_followers) || 0));
      }
      setByDate(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, month]);

  return { byDate, loading };
}
