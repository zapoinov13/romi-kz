import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MetaAccountStatusInfo } from "@/lib/metaAccountStatus";

export function useMetaAccountStatus(actId: string | undefined, enabled = true) {
  const [status, setStatus] = useState<MetaAccountStatusInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!actId?.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("meta-account-status", {
        body: { act_id: actId.trim() },
      });
      if (fnErr) throw fnErr;
      const account = (data?.accounts?.[0] ?? null) as MetaAccountStatusInfo | null;
      if (!account && data?.errors) {
        const msg = Object.values(data.errors as Record<string, string>)[0];
        throw new Error(msg || "Не удалось получить статус");
      }
      setStatus(account);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [actId]);

  useEffect(() => {
    if (enabled && actId?.trim()) void refresh();
  }, [actId, enabled, refresh]);

  return { status, loading, error, refresh };
}

export function useMetaAccountPay() {
  const [paying, setPaying] = useState(false);

  const pay = useCallback(async (actId: string) => {
    setPaying(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("meta-account-pay", {
        body: { act_id: actId.trim() },
      });
      if (fnErr) throw fnErr;
      return data as {
        ok: boolean;
        paid: boolean;
        needs_manual?: boolean;
        message: string;
        billing_url?: string;
        status?: MetaAccountStatusInfo;
      };
    } finally {
      setPaying(false);
    }
  }, []);

  return { pay, paying };
}
