import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";

export type TeamRole = "admin" | "marketer" | "director";

export const ROLE_LABELS: Record<TeamRole, string> = {
  admin: "Админ",
  marketer: "Таргетолог",
  director: "Тим лид",
};

/** Блоки приложения, к которым можно выдать доступ сотруднику. */
export type ModuleKey =
  | "ads"
  | "crm"
  | "metrics"
  | "sales_analytics"
  | "finance"
  | "settings"
  // legacy keys (читаем, но в UI не показываем)
  | "factory"
  | "reports";

export const MODULES: { key: ModuleKey; label: string; description: string }[] = [
  { key: "ads", label: "Управление рекламой", description: "Кабинеты, кампании, статистика" },
  { key: "crm", label: "CRM", description: "Воронка, чаты, сделки" },
  { key: "metrics", label: "Таблица РНП", description: "Показатели по дням" },
  { key: "sales_analytics", label: "Аналитика продаж", description: "Сквозная аналитика" },
  { key: "finance", label: "Финансы", description: "Юнит-экономика и планы" },
  { key: "settings", label: "Настройки", description: "Команда и интеграции" },
];

export const ALL_MODULE_KEYS: ModuleKey[] = MODULES.map((m) => m.key);

const KNOWN_MODULES = new Set<string>([
  ...ALL_MODULE_KEYS,
  "factory",
  "reports",
]);

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  modules: ModuleKey[];
  cabinets: string[];
  createdAt: string;
};

export function defaultModulesForRole(role: TeamRole): ModuleKey[] {
  if (role === "admin") return [...ALL_MODULE_KEYS];
  if (role === "director") return ["ads", "crm", "metrics", "sales_analytics", "finance"];
  return ["ads", "metrics"];
}

export function useTeamStore() {
  const [members, setMembers] = useState<TeamMember[]>([]);

  const refetch = useCallback(async () => {
    const [{ data: profiles }, { data: roles }, { data: modules }, { data: cabinets }] = await Promise.all([
      supabase.from("profiles").select("id, name, display_role, created_at"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("team_member_modules").select("user_id, module_key"),
      supabase.from("team_member_cabinets").select("user_id, cabinet_id"),
    ]);

    const roleByUser = new Map<string, TeamRole>();
    (roles ?? []).forEach((r: { user_id: string; role: string }) => {
      const mapped =
        r.role === "admin" || r.role === "marketer" || r.role === "director"
          ? (r.role as TeamRole)
          : r.role === "manager"
            ? "marketer"
            : null;
      if (mapped) roleByUser.set(r.user_id, mapped);
    });
    const modsByUser = new Map<string, ModuleKey[]>();
    (modules ?? []).forEach((m: { user_id: string; module_key: string }) => {
      if (!KNOWN_MODULES.has(m.module_key)) return;
      const arr = modsByUser.get(m.user_id) ?? [];
      arr.push(m.module_key as ModuleKey);
      modsByUser.set(m.user_id, arr);
    });
    const cabsByUser = new Map<string, string[]>();
    (cabinets ?? []).forEach((c: { user_id: string; cabinet_id: string }) => {
      const arr = cabsByUser.get(c.user_id) ?? [];
      arr.push(c.cabinet_id);
      cabsByUser.set(c.user_id, arr);
    });

    const list: TeamMember[] = (profiles ?? []).map((p: { id: string; name: string | null; display_role?: string | null; created_at: string }) => {
      const role = roleByUser.get(p.id) ?? "marketer";
      const mods = modsByUser.get(p.id);
      return {
        id: p.id,
        name: p.name ?? "",
        email: "",
        role,
        modules: role === "admin" ? [...ALL_MODULE_KEYS] : (mods?.length ? mods : defaultModulesForRole(role)),
        cabinets: cabsByUser.get(p.id) ?? [],
        createdAt: p.created_at,
      };
    });
    setMembers(list);
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);
  useRealtimeTable("profiles", refetch);
  useRealtimeTable("user_roles", refetch);
  useRealtimeTable("team_member_modules", refetch);
  useRealtimeTable("team_member_cabinets", refetch);

  const addMember = useCallback(async (m: Omit<TeamMember, "id" | "createdAt">) => {
    const modules = m.role === "admin" ? ALL_MODULE_KEYS : m.modules;
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email: m.email,
        name: m.name,
        role: m.role,
        modules,
        cabinets: m.cabinets,
        invite: true,
      },
    });
    if (error) throw error;
    await refetch();
    return { ...m, id: (data as { id: string }).id, createdAt: new Date().toISOString() };
  }, [refetch]);

  const updateMember = useCallback(async (id: string, patch: Partial<TeamMember>) => {
    const profilePatch: { name?: string; display_role?: string | null } = {};
    if (patch.name !== undefined) profilePatch.name = patch.name;
    if (patch.role !== undefined) profilePatch.display_role = patch.role;
    if (Object.keys(profilePatch).length) {
      await supabase.from("profiles").update(profilePatch).eq("id", id);
    }
    if (patch.role !== undefined) {
      await supabase.from("user_roles").delete().eq("user_id", id);
      await supabase.from("user_roles").insert({ user_id: id, role: patch.role });
    }
    if (patch.modules !== undefined || patch.role === "admin") {
      const modules =
        patch.role === "admin" ? ALL_MODULE_KEYS : (patch.modules ?? []);
      await supabase.from("team_member_modules").delete().eq("user_id", id);
      if (modules.length) {
        await supabase.from("team_member_modules").insert(
          modules.map((module_key) => ({ user_id: id, module_key })),
        );
      }
    }
    if (patch.cabinets !== undefined) {
      await supabase.from("team_member_cabinets").delete().eq("user_id", id);
      if (patch.cabinets.length) {
        await supabase.from("team_member_cabinets").insert(
          patch.cabinets.map((cid) => ({ user_id: id, cabinet_id: cid })),
        );
      }
    }
    await refetch();
  }, [refetch]);

  const removeMember = useCallback(async (id: string) => {
    await supabase.functions.invoke("admin-delete-user", { body: { user_id: id } });
    await refetch();
  }, [refetch]);

  return { members, addMember, updateMember, removeMember };
}
