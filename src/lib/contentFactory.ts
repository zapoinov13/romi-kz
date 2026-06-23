/**
 * Content-factory workflow.
 * Все запросы идут напрямую в edge-функцию `factory-generate`
 * (Lovable AI Gateway → Nano Banana 2). Никакого n8n.
 */
import { supabase } from "@/integrations/supabase/client";

/** Hard timeout for a single style generation request (ms). */
export const N8N_TIMEOUT_MS = 180_000; // legacy export name; используется как общий клиентский таймаут

function formatFetchError(e: unknown): string {
  const msg = (e as Error)?.message ?? "network error";
  if (msg.includes("aborted") || msg.includes("timeout")) {
    return `Таймаут (${Math.round(N8N_TIMEOUT_MS / 1000)}s) — генератор не ответил`;
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Нет связи с сервером. Проверьте интернет и повторите. Если ошибка в Lovable preview — нажмите Publish и откройте опубликованный сайт.";
  }
  return msg;
}

/**
 * Отправка одного стиля в edge function `factory-generate` (Lovable AI / Nano Banana).
 * n8n больше не используется. Возвращает { image_url, request_id, ... }.
 */
export async function postContentFactory(
  payload: unknown | FormData,
): Promise<unknown> {
  if (typeof FormData !== "undefined" && payload instanceof FormData) {
    throw new Error("multipart не поддерживается — загрузите фото в Storage и отправьте image_urls");
  }
  const { data, error } = await supabase.functions.invoke("factory-generate", {
    body: payload,
  });
  if (error) throw new Error(formatFetchError(error));
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data;
}
