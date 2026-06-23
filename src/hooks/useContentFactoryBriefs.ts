import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_BRIEFS, type ContentFactoryType } from "@/lib/contentFactoryDefaults";

export interface BriefRow {
  content_type: ContentFactoryType;
  system_prompt: string;
  is_custom: boolean;       // true если есть запись в БД
  updated_at?: string;
}

export function useContentFactoryBriefs(projectId: string | null | undefined) {
  const [rows, setRows] = useState<BriefRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!projectId) { setRows([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("content_factory_briefs")
      .select("content_type, system_prompt, updated_at")
      .eq("project_id", projectId);
    const byType = new Map<string, { system_prompt: string; updated_at: string }>();
    for (const r of data ?? []) byType.set((r as any).content_type, r as any);
    const result: BriefRow[] = (Object.keys(DEFAULT_BRIEFS) as ContentFactoryType[]).map((t) => {
      const r = byType.get(t);
      return {
        content_type: t,
        system_prompt: r?.system_prompt?.trim() || DEFAULT_BRIEFS[t],
        is_custom: !!r,
        updated_at: r?.updated_at,
      };
    });
    setRows(result);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void refetch(); }, [refetch]);

  const save = useCallback(async (contentType: ContentFactoryType, systemPrompt: string) => {
    if (!projectId) throw new Error("Нет активного проекта");
    const { error } = await supabase.from("content_factory_briefs").upsert({
      project_id: projectId,
      content_type: contentType,
      system_prompt: systemPrompt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id,content_type" });
    if (error) throw error;
    await refetch();
  }, [projectId, refetch]);

  const resetToDefault = useCallback(async (contentType: ContentFactoryType) => {
    if (!projectId) throw new Error("Нет активного проекта");
    await supabase.from("content_factory_briefs")
      .delete().eq("project_id", projectId).eq("content_type", contentType);
    await refetch();
  }, [projectId, refetch]);

  return { rows, loading, refetch, save, resetToDefault };
}