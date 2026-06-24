import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface IceBreaker {
  question: string;
  answer: string;
}

export interface CabinetMessageTemplate {
  id: string;
  cabinet_id: string;
  project_id: string;
  name: string;
  greeting: string;
  ice_breakers: IceBreaker[];
  cta_label: string | null;
  cta_payload: string | null;
  is_default: boolean;
  meta_sync_status: "local" | "synced" | "error" | "pending";
  meta_synced_at: string | null;
  meta_last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateInput {
  name: string;
  greeting: string;
  ice_breakers: IceBreaker[];
  cta_label?: string | null;
  cta_payload?: string | null;
  is_default?: boolean;
}

type Row = Omit<CabinetMessageTemplate, "ice_breakers"> & { ice_breakers: unknown };

function rowToTemplate(r: Row): CabinetMessageTemplate {
  const arr = Array.isArray(r.ice_breakers) ? (r.ice_breakers as IceBreaker[]) : [];
  return {
    ...r,
    ice_breakers: arr.map((x) => ({
      question: String(x?.question ?? ""),
      answer: String(x?.answer ?? ""),
    })),
  };
}

export function useCabinetMessageTemplates(
  cabinetId: string | null | undefined,
  projectId: string | null | undefined,
) {
  const [rows, setRows] = useState<CabinetMessageTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!cabinetId) { setRows([]); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("cabinet_message_templates" as never)
      .select("*")
      .eq("cabinet_id", cabinetId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows(((data ?? []) as Row[]).map(rowToTemplate));
    }
    setLoading(false);
  }, [cabinetId]);

  useEffect(() => { void refetch(); }, [refetch]);

  const create = useCallback(async (input: TemplateInput) => {
    if (!cabinetId || !projectId) throw new Error("Нет активного кабинета");
    if (input.is_default) {
      await supabase
        .from("cabinet_message_templates" as never)
        .update({ is_default: false } as never)
        .eq("cabinet_id", cabinetId);
    }
    const { data, error: err } = await supabase
      .from("cabinet_message_templates" as never)
      .insert({
        cabinet_id: cabinetId,
        project_id: projectId,
        name: input.name,
        greeting: input.greeting,
        ice_breakers: input.ice_breakers as unknown,
        cta_label: input.cta_label ?? null,
        cta_payload: input.cta_payload ?? null,
        is_default: input.is_default ?? false,
      } as never)
      .select("*")
      .single();
    if (err) throw err;
    await refetch();
    return rowToTemplate(data as Row);
  }, [cabinetId, projectId, refetch]);

  const update = useCallback(async (id: string, input: TemplateInput) => {
    if (!cabinetId) throw new Error("Нет активного кабинета");
    if (input.is_default) {
      await supabase
        .from("cabinet_message_templates" as never)
        .update({ is_default: false } as never)
        .eq("cabinet_id", cabinetId)
        .neq("id", id);
    }
    const { error: err } = await supabase
      .from("cabinet_message_templates" as never)
      .update({
        name: input.name,
        greeting: input.greeting,
        ice_breakers: input.ice_breakers as unknown,
        cta_label: input.cta_label ?? null,
        cta_payload: input.cta_payload ?? null,
        is_default: input.is_default ?? false,
        meta_sync_status: "local",
      } as never)
      .eq("id", id);
    if (err) throw err;
    await refetch();
  }, [cabinetId, refetch]);

  const duplicate = useCallback(async (id: string) => {
    const src = rows.find((r) => r.id === id);
    if (!src) throw new Error("Шаблон не найден");
    return create({
      name: `${src.name} (копия)`,
      greeting: src.greeting,
      ice_breakers: src.ice_breakers,
      cta_label: src.cta_label,
      cta_payload: src.cta_payload,
      is_default: false,
    });
  }, [rows, create]);

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from("cabinet_message_templates" as never)
      .delete()
      .eq("id", id);
    if (err) throw err;
    await refetch();
  }, [refetch]);

  const syncToMeta = useCallback(async (id: string) => {
    const { data, error: err } = await supabase.functions.invoke(
      "meta-page-messaging-sync",
      { body: { template_id: id } },
    );
    if (err) throw err;
    if ((data as { ok?: boolean })?.ok === false) {
      throw new Error((data as { error?: string; message?: string })?.message
        || (data as { error?: string })?.error
        || "Не удалось применить шаблон в Meta");
    }
    await refetch();
    return data;
  }, [refetch]);

  return { rows, loading, error, refetch, create, update, duplicate, remove, syncToMeta };
}
