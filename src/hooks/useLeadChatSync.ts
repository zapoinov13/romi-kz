import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProjectsStore } from "@/hooks/useProjectsStore";

/**
 * Keep an open lead chat in sync: Supabase Realtime (filtered) + short polling fallback.
 * Webhook inserts often miss the global CRM channel when RLS/replica lag — this fixes live UI.
 * Also pulls WhatsApp profile name via Green API getContactInfo (not phonebook label).
 */
export function useLeadChatSync(
  leadId: string | null | undefined,
  enabled: boolean,
  refresh: (leadId: string) => void,
  pollMs = 4000,
) {
  const { activeId: projectId } = useProjectsStore();
  const syncedRef = useRef<string | null>(null);

  const syncWaName = useCallback(
    async (id: string) => {
      try {
        await supabase.functions.invoke("greenapi-proxy", {
          body: {
            action: "syncLeadName",
            lead_id: id,
            project_id: projectId ?? undefined,
          },
        });
      } catch {
        /* best-effort */
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!enabled || !leadId) return;

    const runSync = async () => {
      if (syncedRef.current !== leadId) {
        syncedRef.current = leadId;
        await syncWaName(leadId);
      }
      refresh(leadId);
    };

    void runSync();

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
        () => {
          void syncWaName(leadId).then(() => refresh(leadId));
        },
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
  }, [leadId, enabled, refresh, pollMs, syncWaName]);
}
