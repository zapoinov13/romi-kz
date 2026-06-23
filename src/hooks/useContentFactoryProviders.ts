import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ContentFactoryProvider } from "@/lib/contentFactoryDefaults";

export interface ProviderKeyRow {
  id: string;
  provider: ContentFactoryProvider;
  key_hint: string | null;
  priority: number;
  is_enabled: boolean;
  status: "unknown" | "ok" | "error" | "quota";
  last_checked_at: string | null;
  last_error: string | null;
  balance_info: unknown;
  updated_at: string;
}

export function useContentFactoryProviders(projectId: string | null | undefined) {
  const [rows, setRows] = useState<ProviderKeyRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!projectId) { setRows([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("content_factory_provider_keys")
      .select("id, provider, key_hint, priority, is_enabled, status, last_checked_at, last_error, balance_info, updated_at")
      .eq("project_id", projectId)
      .order("priority", { ascending: true });
    setRows((data ?? []) as unknown as ProviderKeyRow[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void refetch(); }, [refetch]);

  const save = useCallback(async (provider: ContentFactoryProvider, apiKey: string, priority = 100) => {
    if (!projectId) throw new Error("Нет активного проекта");
    const { data, error } = await supabase.functions.invoke("factory-provider-key-save", {
      body: { project_id: projectId, provider, api_key: apiKey, priority },
    });
    if (error) throw error;
    if ((data as any)?.ok === false) throw new Error((data as any)?.error ?? "Ключ невалидный");
    await refetch();
    return data;
  }, [projectId, refetch]);

  const test = useCallback(async (provider: ContentFactoryProvider) => {
    if (!projectId) throw new Error("Нет активного проекта");
    const { data, error } = await supabase.functions.invoke("factory-provider-key-test", {
      body: { project_id: projectId, provider },
    });
    if (error) throw error;
    await refetch();
    return data;
  }, [projectId, refetch]);

  const remove = useCallback(async (provider: ContentFactoryProvider) => {
    if (!projectId) throw new Error("Нет активного проекта");
    const { data, error } = await supabase.functions.invoke("factory-provider-key-delete", {
      body: { project_id: projectId, provider },
    });
    if (error) throw error;
    await refetch();
    return data;
  }, [projectId, refetch]);

  const setPriority = useCallback(async (provider: ContentFactoryProvider, priority: number) => {
    if (!projectId) throw new Error("Нет активного проекта");
    await supabase.from("content_factory_provider_keys")
      .update({ priority })
      .eq("project_id", projectId)
      .eq("provider", provider);
    await refetch();
  }, [projectId, refetch]);

  const toggleEnabled = useCallback(async (provider: ContentFactoryProvider, enabled: boolean) => {
    if (!projectId) throw new Error("Нет активного проекта");
    await supabase.from("content_factory_provider_keys")
      .update({ is_enabled: enabled })
      .eq("project_id", projectId)
      .eq("provider", provider);
    await refetch();
  }, [projectId, refetch]);

  return { rows, loading, refetch, save, test, remove, setPriority, toggleEnabled };
}