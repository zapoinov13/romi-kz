const API_BASE = "https://graph.facebook.com/v21.0";

export const META_OAUTH_SCOPES = [
  "public_profile",
  "ads_read",
  "ads_management",
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "business_management",
] as const;

export function getMetaAppId(): string {
  return Deno.env.get("META_APP_ID")?.trim() ?? "";
}

export function getMetaAppSecret(): string {
  return Deno.env.get("META_APP_SECRET")?.trim() ?? "";
}

export function getOAuthRedirectUri(): string {
  const explicit = Deno.env.get("META_OAUTH_REDIRECT_URI")?.trim();
  if (explicit) return explicit;
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
  return `${base}/functions/v1/meta-oauth-callback`;
}

export function getFrontendUrl(): string {
  return (
    Deno.env.get("FRONTEND_URL")?.trim() ||
    Deno.env.get("APP_URL")?.trim() ||
    "https://romi-agency.vercel.app"
  ).replace(/\/$/, "");
}

export async function validateMarketingPermissions(token: string): Promise<string | null> {
  const r = await fetch(`${API_BASE}/me/permissions?access_token=${encodeURIComponent(token)}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return body?.error?.message ?? "Не удалось проверить права Meta-токена";
  const granted = new Set(
    ((body?.data ?? []) as Array<{ permission?: string; status?: string }>)
      .filter((p) => p.status === "granted")
      .map((p) => p.permission),
  );
  if (granted.has("ads_read") || granted.has("ads_management")) return null;
  return "Токен активный, но без прав ads_read / ads_management.";
}

export async function fetchMe(
  token: string,
): Promise<{ id: string; name: string } | { error: string }> {
  const r = await fetch(`${API_BASE}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  const me = await r.json().catch(() => ({}));
  if (!r.ok) return { error: me?.error?.message ?? "Невалидный токен" };
  return { id: String(me.id), name: String(me.name ?? me.id) };
}

export async function exchangeCodeForToken(
  code: string,
): Promise<{ access_token: string; expires_in?: number } | { error: string }> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  const redirectUri = getOAuthRedirectUri();
  if (!appId || !appSecret) {
    return { error: "META_APP_ID / META_APP_SECRET не настроены на сервере" };
  }

  const url = new URL(`${API_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body?.access_token) {
    return { error: body?.error?.message ?? "Не удалось обменять code на токен" };
  }
  return {
    access_token: String(body.access_token),
    expires_in: typeof body.expires_in === "number" ? body.expires_in : undefined,
  };
}

export async function exchangeForLongLivedToken(
  shortToken: string,
): Promise<{ access_token: string; expires_in?: number } | { error: string }> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  if (!appId || !appSecret) {
    return { error: "META_APP_ID / META_APP_SECRET не настроены на сервере" };
  }

  const url = new URL(`${API_BASE}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortToken);

  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body?.access_token) {
    return { error: body?.error?.message ?? "Не удалось получить long-lived токен" };
  }
  return {
    access_token: String(body.access_token),
    expires_in: typeof body.expires_in === "number" ? body.expires_in : undefined,
  };
}

export function buildFacebookOAuthUrl(state: string): string {
  const appId = getMetaAppId();
  const redirectUri = getOAuthRedirectUri();
  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_OAUTH_SCOPES.join(","));
  return url.toString();
}
