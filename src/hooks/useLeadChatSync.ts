import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestLeadChatRefresh } from "@/lib/crmChatRefresh";
import { useProjectsStore } from "@/hooks/useProjectsStore";

/**
 * Keep an open lead chat in sync: Supabase Realtime (filtered) + short polling fallback.
 * Webhook inserts often miss the global CRM channel when RLS/replica lag — this fixes live UI.
 * Optionally pulls WhatsApp profile name via Green API getContactInfo (skipped for WA Web / LID).
 */
export function useLeadChatSync(
  leadId: string | null | undefined,
  enabled: boolean,
  refresh?: (leadId: string) => void,
  pollMs = 4000,
) {
  const { activeId: projectId } = useProjectsStore();
  const syncedRef = useRef<string | null>(null);
  const greenApiOkRef = useRef<boolean | null>(null);

  const reload = useCallback(
    (id: string) => {
      if (typeof refresh === "function") {
        refresh(id);
      } else {
        requestLeadChatRefresh(id);
      }
    },
    [refresh],
  );

  const hasGreenApi = useCallback(async (): Promise<boolean> => {
    if (greenApiOkRef.current !== null) return greenApiOkRef.current;
    if (!projectId) {
      greenApiOkRef.current = false;
      return false;
    }
    try {
      // Prefer WhatsApp Web — no Green API name sync needed.
      const { data: web } = await supabase
        .from("whatsapp_web_sessions" as never)
        .select("status")
        .eq("project_id", projectId)
        .eq("status", "connected")
        .limit(1);
      if (Array.isArray(web) && web.length > 0) {
        greenApiOkRef.current = false;
        return false;
      }

      const { data: ga } = await supabase
        .from("whatsapp_config_safe")
        .select("id_instance, api_token_present, connected")
        .eq("project_id", projectId)
        .limit(1)
        .maybeSingle();
      const row = ga as {
        id_instance?: string | null;
        api_token_present?: boolean | null;
        connected?: boolean | null;
      } | null;
      greenApiOkRef.current = !!(row?.id_instance && row.api_token_present && row.connected);
      return greenApiOkRef.current;
    } catch {
      greenApiOkRef.current = false;
      return false;
    }
  }, [projectId]);

  const syncWaName = useCallback(
    async (id: string) => {
      try {
        if (!(await hasGreenApi())) return;
        const { error } = await supabase.functions.invoke("greenapi-sync-name", {
          body: {
            lead_id: id,
            project_id: projectId ?? undefined,
          },
        });
        // Soft-fail — never surface as UI runtime error (Lovable blank screen).
        if (error) return;
      } catch {
        /* best-effort */
      }
    },
    [projectId, hasGreenApi],
  );

  useEffect(() => {
    greenApiOkRef.current = null;
  }, [projectId]);

  useEffect(() => {
    if (!enabled || !leadId) return;

    const runSync = async () => {
      if (syncedRef.current !== leadId) {
        syncedRef.current = leadId;
        await syncWaName(leadId);
      }
      reload(leadId);
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
          void syncWaName(leadId).then(() => reload(leadId));
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
        () => reload(leadId),
      )
      .subscribe();

    const poll = window.setInterval(() => reload(leadId), pollMs);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [leadId, enabled, reload, pollMs, syncWaName]);
}
