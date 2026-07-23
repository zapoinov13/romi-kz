/**
 * Зеркало кабинетов в szfg (client_configs) — ОТКЛЮЧЕНО для ROMI-KZ.
 * Кабинеты пишутся только в основной Supabase (ad_cabinets / rgtt…).
 */
import type { AdCabinet } from "@/types/ads";

export async function syncCabinetToClientConfig(_c: AdCabinet): Promise<void> {
  /* disabled: no dual-write to szfg */
}

export async function deleteCabinetFromClientConfig(_id: string): Promise<void> {
  /* disabled: no dual-write to szfg */
}
