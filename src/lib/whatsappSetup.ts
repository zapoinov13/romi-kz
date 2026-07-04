import { supabase } from "@/integrations/supabase/client";

/** CRM ingress — Green API must point here (single webhook URL). */
export function getCrmWebhookUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, "") ?? "";
  return `${base}/functions/v1/greenapi-webhook`;
}

export type WebhookSetupResult = {
  ok: boolean;
  matched: boolean;
  error?: string;
};

/** Прописать CRM webhook в Green API и проверить, что URL совпадает. */
export async function ensureCrmWebhook(
  projectId: string,
  cabinetId: string,
): Promise<WebhookSetupResult> {
  const crmUrl = getCrmWebhookUrl();
  try {
    const { data: setData, error: setError } = await supabase.functions.invoke("greenapi-proxy", {
      body: { action: "setWebhook", webhookUrl: crmUrl, project_id: projectId, cabinet_id: cabinetId },
    });
    if (setError) {
      return { ok: false, matched: false, error: setError.message };
    }
    if ((setData as { ok?: boolean } | null)?.ok === false) {
      const detail =
        (setData as { error?: string } | null)?.error
        ?? JSON.stringify((setData as { data?: unknown })?.data ?? setData);
      return { ok: false, matched: false, error: detail };
    }

    const { data: settingsData, error: settingsError } = await supabase.functions.invoke(
      "greenapi-proxy",
      { body: { action: "settings", project_id: projectId, cabinet_id: cabinetId } },
    );
    if (settingsError) {
      return { ok: true, matched: false, error: settingsError.message };
    }
    const live = (settingsData as { data?: { webhookUrl?: string } } | null)?.data?.webhookUrl ?? "";
    const matched = !!live && live.replace(/\/+$/, "").split("?")[0] === crmUrl.replace(/\/+$/, "");
    return { ok: true, matched };
  } catch (e) {
    return { ok: false, matched: false, error: (e as Error).message };
  }
}

export function isValidBotWebhookUrl(raw: string): boolean {
  const v = raw.trim();
  if (!v) return true;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "169.254.169.254") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export const WHATSAPP_SETUP_STEPS = [
  { id: "bind", title: "Привязать инстанс", hint: "idInstance + apiToken из Green API Console" },
  { id: "webhook", title: "Webhook CRM", hint: "Настраивается автоматически после привязки" },
] as const;
