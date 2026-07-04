import { supabase } from "@/integrations/supabase/client";

/** CRM ingress — Green API must point here (single webhook URL). */
export function getCrmWebhookUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, "") ?? "";
  return `${base}/functions/v1/greenapi-webhook`;
}

export type WebhookSetupResult = {
  ok: boolean;
  matched: boolean;
  incomingEnabled?: boolean;
  liveWebhookUrl?: string;
  error?: string;
};

type GreenSettings = {
  webhookUrl?: string;
  incomingWebhook?: string;
  incomingMessageWebhook?: string;
  webhookUrlToken?: string;
};

/** Прописать CRM webhook в Green API и проверить, что URL совпадает. */
export async function ensureCrmWebhook(
  projectId: string,
  cabinetId: string,
): Promise<WebhookSetupResult> {
  const crmUrl = getCrmWebhookUrl();
  try {
    const { data: setData, error: setError } = await supabase.functions.invoke("greenapi-proxy", {
      body: {
        action: "setWebhook",
        webhookUrl: crmUrl,
        project_id: projectId,
        cabinet_id: cabinetId,
        forceRotate: true,
      },
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

    return verifyCrmWebhook(projectId, cabinetId);
  } catch (e) {
    return { ok: false, matched: false, error: (e as Error).message };
  }
}

/** Проверить текущий webhook в Green API (без перезаписи). */
export async function verifyCrmWebhook(
  projectId: string,
  cabinetId: string,
): Promise<WebhookSetupResult> {
  const crmUrl = getCrmWebhookUrl();
  try {
    const { data: settingsData, error: settingsError } = await supabase.functions.invoke(
      "greenapi-proxy",
      { body: { action: "settings", project_id: projectId, cabinet_id: cabinetId } },
    );
    if (settingsError) {
      return { ok: false, matched: false, error: settingsError.message };
    }
    const liveSettings = (settingsData as { data?: GreenSettings } | null)?.data;
    const live = liveSettings?.webhookUrl ?? "";
    const incomingEnabled =
      liveSettings?.incomingWebhook === "yes"
      || liveSettings?.incomingMessageWebhook === "yes";
    const urlBaseOk = !!live
      && live.replace(/\/+$/, "").split("?")[0] === crmUrl.replace(/\/+$/, "");
    const tokenOk = live.includes("token=") || !!(liveSettings?.webhookUrlToken?.trim());
    const matched = urlBaseOk && incomingEnabled && tokenOk;
    return {
      ok: true,
      matched,
      incomingEnabled,
      liveWebhookUrl: live,
      error: !urlBaseOk
        ? `Green API шлёт на: ${live || "—"} (нужен ROMI CRM webhook)`
        : !incomingEnabled
          ? "incomingWebhook выключен в Green API"
          : !tokenOk
            ? "webhookUrlToken не прописан в Green API — нажмите «Синхронизировать webhook»"
            : undefined,
    };
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

export const WHATSAPP_CONFIG_SAFE_SELECT =
  "id, project_id, cabinet_id, id_instance, api_token_present, api_url, phone, connected, ads_only, bot_webhook_url, webhook_url";

/** Prod без миграции cabinet_id — колонки нет во view. */
export const WHATSAPP_CONFIG_SAFE_SELECT_LEGACY =
  "id, project_id, id_instance, api_token_present, api_url, phone, connected, ads_only, bot_webhook_url, webhook_url";

export function shouldUseLegacyWhatsappSelect(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("cabinet_id")
    || m.includes("permission denied")
    || m.includes("42501")
    || m.includes("pgrst202")
    || m.includes("could not find")
  );
}

/** @deprecated use shouldUseLegacyWhatsappSelect */
export const isCabinetMigrationMissing = shouldUseLegacyWhatsappSelect;

type WhatsappSafeQuery = {
  data: WhatsappConfigSafeRow | WhatsappConfigSafeRow[] | null;
  error: { message: string } | null;
  usedLegacySelect: boolean;
};

/** Select from whatsapp_config_safe; falls back without cabinet_id on any read error. */
export async function queryWhatsappConfigSafe(
  build: (select: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<WhatsappSafeQuery> {
  const full = await build(WHATSAPP_CONFIG_SAFE_SELECT);
  if (!full.error) {
    return {
      data: full.data as WhatsappConfigSafeRow | WhatsappConfigSafeRow[] | null,
      error: null,
      usedLegacySelect: false,
    };
  }
  const legacy = await build(WHATSAPP_CONFIG_SAFE_SELECT_LEGACY);
  return {
    data: legacy.data as WhatsappConfigSafeRow | WhatsappConfigSafeRow[] | null,
    error: legacy.error,
    usedLegacySelect: true,
  };
}

export type BindWhatsappResult = {
  error: { message: string } | null;
  usedLegacyRpc: boolean;
};

/** Bind Green API instance to project + cabinet. */
export async function bindWhatsappToProject(params: {
  projectId: string;
  cabinetId: string;
  idInstance: string;
  apiToken?: string | null;
  apiUrl?: string | null;
}): Promise<BindWhatsappResult> {
  const token =
    params.apiToken && params.apiToken.length >= 20 ? params.apiToken : undefined;

  const { error } = await supabase.rpc("bind_whatsapp_to_project", {
    p_project_id: params.projectId,
    p_cabinet_id: params.cabinetId,
    p_id_instance: params.idInstance,
    p_api_token: token,
    p_api_url: params.apiUrl ?? undefined,
  });
  return { error: error ?? null, usedLegacyRpc: false };
}

export type WhatsappConfigSafeRow = {
  id: string;
  project_id: string | null;
  cabinet_id: string | null;
  id_instance: string | null;
  api_token_present: boolean | null;
  api_url: string | null;
  phone: string | null;
  connected: boolean | null;
  ads_only: boolean | null;
  bot_webhook_url?: string | null;
  webhook_url?: string | null;
};

/** Сохранить URL n8n/ИИ-бота — ROMI пересылает туда копию каждого webhook-события Green API. */
export async function saveBotWebhookUrl(
  projectId: string,
  url: string,
): Promise<{ error: { message: string } | null }> {
  const trimmed = url.trim();
  if (trimmed && !isValidBotWebhookUrl(trimmed)) {
    return { error: { message: "URL должен быть https (например n8n.zapoinov.com/webhook/…)" } };
  }
  const crmBase = getCrmWebhookUrl().replace(/\/+$/, "");
  if (trimmed && trimmed.replace(/\/+$/, "").split("?")[0] === crmBase) {
    return {
      error: {
        message: "Это URL CRM, не n8n. Укажите webhook n8n-бота — ROMI сам принимает сообщения.",
      },
    };
  }
  const { error } = await supabase.rpc("save_whatsapp_bot_webhook", {
    p_project_id: projectId,
    p_bot_webhook_url: trimmed,
  });
  return { error: error ?? null };
}

/** Prefer cabinet match, then legacy row without cabinet, then any project row. */
export function pickWhatsappConfigRow(
  rows: WhatsappConfigSafeRow[],
  cabinetId: string | null,
): WhatsappConfigSafeRow | null {
  if (rows.length === 0) return null;
  if (cabinetId) {
    return (
      rows.find((r) => r.cabinet_id === cabinetId)
      ?? rows.find((r) => !r.cabinet_id)
      ?? rows[0]
    );
  }
  return rows[0];
}
