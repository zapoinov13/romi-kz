import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

export type LossReasonRow = {
  id: string;
  key: string;
  label: string;
  emoji: string;
  order_index: number;
};

export function useLossReasons() {
  const [items, setItems] = useState<LossReasonRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("loss_reasons")
      .select("id, key, label, emoji, order_index")
      .order("order_index");
    if (!error) setItems((data ?? []) as LossReasonRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useRealtimeTable("loss_reasons", () => void load());

  return { items, loading, refresh: load };
}
