/**
 * Клиент второго Supabase (Clony / szfgdruhlebfvcmlvxdk).
 *
 * В ROMI-KZ запись и чтение туда ОТКЛЮЧЕНЫ: кабинеты, CRM и секреты
 * живут только в основном проекте (VITE_SUPABASE_URL = rgttklitvvqsnlsakvzr).
 * Контент-завод / n8n на szfg больше не зеркалятся из этого приложения.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const clientConfigSupabase: SupabaseClient | null = null;

export interface PendingAdvance {
  id: string;
  phone: string | null;
  fb_ad_account_id: string | null;
  auto_advance_stage: string | null;
  auto_advance_at: string | null;
}

/** Лиды для auto-advance — отключено вместе с client config DB. */
export async function fetchPendingAdvances(): Promise<PendingAdvance[]> {
  return [];
}

export async function markAdvanceDone(_leadCrmId: string): Promise<void> {
  /* no-op */
}
