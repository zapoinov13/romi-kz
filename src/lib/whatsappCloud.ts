import { supabase } from "@/integrations/supabase/client";

export type WhatsAppAccountSafe = {
  id: string;
  project_id: string;
  cabinet_id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone: string | null;
  display_name: string | null;
  onboarding_mode: string;
  connected: boolean;
  connected_at: string | null;
  access_token_present?: boolean;
};

export type WaEmbeddedConfig = {
  ok?: boolean;
  ready: boolean;
  appId?: string;
  configId?: string;
  graphVersion?: string;
  featureType?: string;
  sessionInfoVersion?: string;
  error?: string;
  hint?: string;
};

export async function fetchWaEmbeddedConfig(): Promise<WaEmbeddedConfig> {
  const { data, error } = await supabase.functions.invoke("wa-embedded-config", {
    body: {},
  });
  if (error) throw new Error(error.message);
  return data as WaEmbeddedConfig;
}

export async function fetchWaStatus(projectId: string, cabinetId: string) {
  const { data, error } = await supabase.functions.invoke("wa-status", {
    body: { project_id: projectId, cabinet_id: cabinetId },
  });
  if (error) throw new Error(error.message);
  return data as {
    ok: boolean;
    connected: boolean;
    liveOk?: boolean | null;
    liveError?: string | null;
    account: WhatsAppAccountSafe | null;
  };
}

export async function completeWaOnboarding(params: {
  projectId: string;
  cabinetId: string;
  code?: string;
  wabaId?: string;
  phoneNumberId?: string;
  displayPhone?: string;
  displayName?: string;
  accessToken?: string;
}) {
  const { data, error } = await supabase.functions.invoke("wa-complete", {
    body: {
      project_id: params.projectId,
      cabinet_id: params.cabinetId,
      code: params.code,
      waba_id: params.wabaId,
      phone_number_id: params.phoneNumberId,
      display_phone: params.displayPhone,
      display_name: params.displayName,
      access_token: params.accessToken,
    },
  });
  if (error) throw new Error(error.message);
  if ((data as { error?: string } | null)?.error) {
    throw new Error((data as { error: string }).error);
  }
  return data;
}

export async function disconnectWaAccount(params: {
  accountId?: string;
  projectId?: string;
  cabinetId?: string;
}) {
  const { data, error } = await supabase.functions.invoke("wa-disconnect", {
    body: {
      account_id: params.accountId,
      project_id: params.projectId,
      cabinet_id: params.cabinetId,
    },
  });
  if (error) throw new Error(error.message);
  if ((data as { error?: string } | null)?.error) {
    throw new Error((data as { error: string }).error);
  }
  return data;
}

export async function sendWaCloudMessage(params: {
  projectId: string;
  cabinetId?: string | null;
  leadId?: string;
  phone?: string;
  message: string;
}) {
  const { data, error } = await supabase.functions.invoke("wa-send", {
    body: {
      project_id: params.projectId,
      cabinet_id: params.cabinetId ?? undefined,
      lead_id: params.leadId,
      phone: params.phone,
      message: params.message,
    },
  });
  if (error) throw new Error(error.message);
  return data as { ok?: boolean; wamid?: string | null; error?: string; code?: string };
}

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (
        cb: (response: { authResponse?: { code?: string }; status?: string }) => void,
        opts: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let fbSdkPromise: Promise<void> | null = null;

export function loadFacebookSdk(appId: string, graphVersion: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.FB) {
    window.FB.init({
      appId,
      cookie: true,
      xfbml: false,
      version: graphVersion.replace(/^v/, "v") === graphVersion ? graphVersion : `v${graphVersion}`,
    });
    return Promise.resolve();
  }
  if (fbSdkPromise) return fbSdkPromise;

  fbSdkPromise = new Promise((resolve, reject) => {
    const version = graphVersion.startsWith("v") ? graphVersion : `v${graphVersion}`;
    window.fbAsyncInit = () => {
      try {
        window.FB?.init({
          appId,
          cookie: true,
          xfbml: false,
          version,
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => reject(new Error("Не удалось загрузить Facebook SDK"));
    document.body.appendChild(script);
  });
  return fbSdkPromise;
}

export type EmbeddedSignupSession = {
  phone_number_id?: string;
  waba_id?: string;
  event?: string;
  data?: Record<string, unknown>;
};

/**
 * Launch Meta Embedded Signup for WhatsApp Business App Coexistence.
 * Returns exchangeable code + session asset IDs when available.
 */
export async function launchWhatsAppEmbeddedSignup(opts: {
  appId: string;
  configId: string;
  graphVersion: string;
  featureType?: string;
  sessionInfoVersion?: string;
}): Promise<{ code: string; session: EmbeddedSignupSession | null }> {
  await loadFacebookSdk(opts.appId, opts.graphVersion);

  let session: EmbeddedSignupSession | null = null;
  const onMessage = (event: MessageEvent) => {
    if (!event.origin.includes("facebook.com") && !event.origin.includes("fb.com")) return;
    try {
      const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (data?.type === "WA_EMBEDDED_SIGNUP") {
        session = {
          event: data.event,
          phone_number_id: data.data?.phone_number_id ?? data.phone_number_id,
          waba_id: data.data?.waba_id ?? data.waba_id,
          data: data.data,
        };
      }
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("message", onMessage);

  try {
    const code = await new Promise<string>((resolve, reject) => {
      if (!window.FB) {
        reject(new Error("Facebook SDK не загружен"));
        return;
      }
      window.FB.login(
        (response) => {
          const c = response?.authResponse?.code;
          if (c) resolve(c);
          else reject(new Error("Авторизация отменена или code не получен"));
        },
        {
          config_id: opts.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            featureType: opts.featureType ?? "whatsapp_business_app_onboarding",
            sessionInfoVersion: opts.sessionInfoVersion ?? "3",
            setup: {},
          },
        },
      );
    });
    return { code, session };
  } finally {
    window.removeEventListener("message", onMessage);
  }
}
