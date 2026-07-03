import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import type { SalesService } from "@/types/salesAnalytics";

type Row = {
  id: string;
  project_id: string;
  name: string;
  default_price: number;
  is_active: boolean;
  sort_order: number;
};

const toService = (r: Row): SalesService => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  defaultPrice: Number(r.default_price) || 0,
  isActive: r.is_active,
  sortOrder: r.sort_order,
});

export function useSalesServices() {
  const { activeId: projectId } = useProjectsStore();
  const [items, setItems] = useState<SalesService[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) {
      setItems([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_service_catalog")
      .select("id, project_id, name, default_price, is_active, sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });
    if (!error) setItems((data as Row[] ?? []).map(toService));
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(
    async (name: string, defaultPrice: number) => {
      if (!projectId) throw new Error("Нет проекта");
      const { data, error } = await supabase
        .from("sales_service_catalog")
        .insert({
          project_id: projectId,
          name: name.trim(),
          default_price: defaultPrice,
          sort_order: items.length,
        })
        .select("id, project_id, name, default_price, is_active, sort_order")
        .single();
      if (error) throw new Error(error.message);
      setItems((prev) => [...prev, toService(data as Row)]);
    },
    [projectId, items.length],
  );

  const update = useCallback(async (id: string, patch: Partial<Pick<SalesService, "name" | "defaultPrice" | "isActive">>) => {
    const db: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name != null) db.name = patch.name;
    if (patch.defaultPrice != null) db.default_price = patch.defaultPrice;
    if (patch.isActive != null) db.is_active = patch.isActive;
    const { error } = await supabase.from("sales_service_catalog").update(db).eq("id", id);
    if (error) throw new Error(error.message);
    setItems((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              ...(patch.name != null ? { name: patch.name } : {}),
              ...(patch.defaultPrice != null ? { defaultPrice: patch.defaultPrice } : {}),
              ...(patch.isActive != null ? { isActive: patch.isActive } : {}),
            }
          : s,
      ),
    );
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("sales_service_catalog").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setItems((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const activeServices = items.filter((s) => s.isActive);

  return { items, activeServices, loading, refresh: load, add, update, remove };
}
