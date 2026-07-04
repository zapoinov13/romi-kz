import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keep an open lead chat in sync: Supabase Realtime (filtered) + short polling fallback.
 * Webhook inserts often miss the global CRM channel when RLS/replica lag — this fixes live UI.
 */
export function useLeadChatSync(
  leadId: string | null | undefined,
  enabled: boolean,
  refresh: (leadId: string) => void,
  pollMs = 4000,
) {
  useEffect(() => {
    if (!enabled || !leadId) return;

    void refresh(leadId);

    const channel = supabase
      .channel(`lead-chat-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "communications",
          filter: `lead_id=eq.${leadId}`,
        },
        () => refresh(leadId),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "communications",
          filter: `lead_id=eq.${leadId}`,
        },
        () => refresh(leadId),
      )
      .subscribe();

    const poll = window.setInterval(() => refresh(leadId), pollMs);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [leadId, enabled, refresh, pollMs]);
}
