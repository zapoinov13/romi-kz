import { supabase } from "@/integrations/supabase/client";

export type StartMetaOAuthOptions = {
  returnTo?: string;
  projectId?: string;
  label?: string;
};

/** Redirect user to Facebook OAuth consent screen. */
export async function startMetaOAuth(options: StartMetaOAuthOptions = {}): Promise<void> {
  const { data, error } = await supabase.functions.invoke("meta-oauth-start", {
    body: {
      return_to: options.returnTo ?? "/settings?tab=meta",
      project_id: options.projectId,
      label: options.label,
    },
  });

  if (error) {
    throw new Error(error.message || "Не удалось начать авторизацию Facebook");
  }
  if (data?.error) {
    throw new Error(String(data.error));
  }
  if (!data?.url) {
    throw new Error("Сервер не вернул URL авторизации Facebook");
  }

  window.location.href = data.url as string;
}
