import { supabase } from "@/integrations/supabase/client";

/** Нормализация телефона для сравнения (только цифры и +). */
export function normalizePhoneDigits(raw: string): string {
  return (raw ?? "").replace(/[^\d+]/g, "");
}

/** Единый поиск лида по телефону через RPC (project-scoped). */
export async function findLeadIdByPhone(
  phone: string,
  projectId: string | null,
): Promise<string | null> {
  const norm = normalizePhoneDigits(phone);
  if (norm.replace(/\D/g, "").length < 7) return null;

  const { data, error } = await supabase.rpc("find_lead_id_by_phone", {
    p_project_id: projectId,
    p_phone: phone,
  } as never);

  if (error) {
    // RPC может отсутствовать до миграции — fallback на клиентский поиск
    let q = supabase
      .from("leads")
      .select("id, phone")
      .eq("is_personal", false)
      .order("created_at", { ascending: false })
      .limit(500);
    if (projectId) q = q.or(`project_id.eq.${projectId},project_id.is.null`);
    const { data: rows } = await q;
    const digits = norm.replace(/\D/g, "");
    const tail = digits.slice(-10);
    const hit = (rows ?? []).find((r) => {
      const d = normalizePhoneDigits(r.phone ?? "").replace(/\D/g, "");
      return d === digits || (tail.length >= 10 && d.endsWith(tail));
    });
    return hit?.id ?? null;
  }

  return (data as string | null) ?? null;
}
