import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import type { WhatsAppConfig } from "@/types/crm";

/**
 * WhatsApp connection badge for CRM.
 * Prefers Meta Coexistence (`whatsapp_accounts`); falls back to legacy Green API row.
 */
export function useWhatsAppConfig() {
  const { user } = useAuth();
  const { activeId: projectId } = useProjectsStore();
  const [config, setConfig] = useState<WhatsAppConfig>({ connected: false });

  const refetch = useCallback(async () => {
    if (!user?.id) {
      setConfig({ connected: false });
      return;
    }

    if (projectId) {
      const { data: accounts } = await supabase
        .from("whatsapp_accounts_safe" as never)
        .select("display_phone, display_name, connected, connected_at")
        .eq("project_id", projectId)
        .eq("connected", true)
        .limit(1);
      const acc = (Array.isArray(accounts) ? accounts[0] : accounts) as {
        display_phone?: string | null;
        display_name?: string | null;
        connected?: boolean | null;
        connected_at?: string | null;
      } | null;
      if (acc?.connected) {
        setConfig({
          connected: true,
          phone: acc.display_phone ?? undefined,
          displayName: acc.display_name ?? undefined,
          connectedAt: acc.connected_at ?? new Date().toISOString(),
        });
        return;
      }
    }

    // Legacy Green API fallback (transition)
    const configRes = await supabase
      .from("whatsapp_config_safe")
      .select("phone, display_name, connected, connected_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const data = configRes.data;
    setConfig({
      connected: !!data?.connected,
      phone: data?.phone ?? undefined,
      displayName: data?.display_name ?? undefined,
      connectedAt: data?.connected ? (data?.connected_at ?? undefined) : undefined,
    });
  }, [user?.id, projectId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);
  useRealtimeTable("whatsapp_config", refetch, !!user?.id);

  const setWhatsapp = useCallback(async (cfg: WhatsAppConfig) => {
    // Optimistic UI only — real bind goes through Settings → WhatsApp / wa-complete
    setConfig(cfg);
  }, []);

  return { config, setWhatsapp };
}
