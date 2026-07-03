import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

export type CrmNotification = {
  id: string;
  type: "new_lead" | "new_message" | "stage_changed" | "assignee_changed";
  title: string;
  body: string;
  at: string;
  leadId?: string;
};

const MAX = 30;

export function useCrmNotifications() {
  const { activeId: projectId } = useProjectsStore();
  const [items, setItems] = useState<CrmNotification[]>([]);
  const seenLeads = useRef(new Set<string>());
  const booted = useRef(false);

  const push = (n: Omit<CrmNotification, "id">) => {
    setItems((prev) => [{ ...n, id: `${n.type}-${n.at}-${Math.random().toString(36).slice(2, 8)}` }, ...prev].slice(0, MAX));
  };

  const refresh = async () => {
    if (!projectId) return;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data: newLeads }, { data: msgs }] = await Promise.all([
      supabase
        .from("leads")
        .select("id, name, phone, created_at")
        .eq("project_id", projectId)
        .eq("is_personal", false)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("communications")
        .select("id, lead_id, content, created_at, direction, leads(name)")
        .eq("type", "message")
        .eq("direction", "in")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (!booted.current) {
      for (const l of newLeads ?? []) seenLeads.current.add(l.id);
      booted.current = true;
      return;
    }

    for (const l of newLeads ?? []) {
      if (seenLeads.current.has(l.id)) continue;
      seenLeads.current.add(l.id);
      push({
        type: "new_lead",
        title: "Новая заявка",
        body: `${l.name || "Без имени"} · ${l.phone || "—"}`,
        at: l.created_at,
        leadId: l.id,
      });
    }

    for (const m of msgs ?? []) {
      const lead = (m as { leads?: { name?: string } }).leads;
      push({
        type: "new_message",
        title: "Сообщение от клиента",
        body: `${lead?.name ?? "Лид"}: ${String((m as { content?: string }).content ?? "").slice(0, 80)}`,
        at: (m as { created_at: string }).created_at,
        leadId: (m as { lead_id: string }).lead_id,
      });
    }
  };

  useEffect(() => {
    booted.current = false;
    seenLeads.current.clear();
    void refresh();
  }, [projectId]);

  useRealtimeTable("leads", () => void refresh(), !!projectId);
  useRealtimeTable("communications", () => void refresh(), !!projectId);

  const unread = useMemo(() => items.length, [items]);

  const dismiss = (id: string) => setItems((prev) => prev.filter((n) => n.id !== id));
  const clearAll = () => setItems([]);

  return { items, unread, dismiss, clearAll };
}
