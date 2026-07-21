import { requireUser } from "../_lib/auth.ts";
import { getMetaAppId } from "../_lib/meta_connect_helpers.ts";
import { WA_CORS, waJson } from "../_lib/wa_cloud.ts";

/**
 * Public-ish config for Facebook JS Embedded Signup (no secrets).
 * Requires authenticated user.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: WA_CORS });
  if (req.method !== "GET" && req.method !== "POST") {
    return waJson({ error: "Method not allowed" }, 405);
  }

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const appId = getMetaAppId();
  const configId = Deno.env.get("WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID")?.trim() ?? "";
  const graphVersion = Deno.env.get("META_GRAPH_VERSION")?.trim() || "v21.0";

  if (!appId) {
    return waJson({
      error: "META_APP_ID не настроен",
      hint: "Добавьте META_APP_ID в secrets Edge Functions",
    }, 500);
  }
  if (!configId) {
    return waJson({
      error: "WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID не настроен",
      hint: "Создайте Embedded Signup configuration в Meta App → WhatsApp и сохраните config id",
      appId,
      graphVersion,
      ready: false,
    }, 200);
  }

  return waJson({
    ok: true,
    ready: true,
    appId,
    configId,
    graphVersion,
    featureType: "whatsapp_business_app_onboarding",
    sessionInfoVersion: "3",
  });
});
