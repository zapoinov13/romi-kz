/** Pure helpers for WhatsApp Cloud / Coexistence message parsing (shared with tests). */

export function digitsPhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** Personal WhatsApp user phone; rejects groups. */
export function normalizeWaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.includes("@g.us") || s.includes("@broadcast") || s.includes("@lid")) return null;
  const base = s.split("@")[0] ?? s;
  const d = digitsPhone(base);
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

export function extractCloudMessageText(message: Record<string, unknown>): string {
  const type = String(message.type ?? "");
  if (type === "text") {
    const t = (message.text as { body?: string } | undefined)?.body;
    return (t ?? "").trim() || "[Текст]";
  }
  if (type === "button") {
    const t = (message.button as { text?: string } | undefined)?.text;
    return (t ?? "").trim() || "[Кнопка]";
  }
  if (type === "interactive") {
    const interactive = message.interactive as Record<string, unknown> | undefined;
    const btn = interactive?.button_reply as { title?: string } | undefined;
    const list = interactive?.list_reply as { title?: string } | undefined;
    return (btn?.title ?? list?.title ?? "").trim() || "[Интерактив]";
  }
  if (type === "image") return "[Фото]";
  if (type === "video") return "[Видео]";
  if (type === "audio") return "[Аудио]";
  if (type === "document") return "[Документ]";
  if (type === "sticker") return "[Стикер]";
  if (type === "location") return "[Геолокация]";
  if (type === "contacts") return "[Контакт]";
  if (type === "reaction") return "[Реакция]";
  return type ? `[${type}]` : "[Сообщение]";
}

/** Echoes from WhatsApp Business app must not create leads — only attach to existing. */
export function shouldCreateLeadForDirection(
  direction: "in" | "out",
  source: "messages" | "smb_message_echoes",
): boolean {
  if (source === "smb_message_echoes") return false;
  return direction === "in";
}
