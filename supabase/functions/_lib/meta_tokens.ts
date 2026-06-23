// Shared resolver for Meta access tokens.
// Returns all available tokens in priority order:
// 1. Explicit token passed in
// 2. meta_tokens table rows (ordered by created_at)
// 3. legacy automation_settings.meta_access_token
// 4. META_ACCESS_TOKEN env var
//
// Helpers also provide a "try each token until one works" pattern for Meta
// Graph calls so endpoints that depend on a specific Business Manager can
// fall back across multiple connected accounts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

export async function resolveMetaTokens(
  bodyToken?: string | null,
): Promise<string[]> {
  const out: string[] = [];
  if (bodyToken && bodyToken.trim()) out.push(bodyToken.trim());

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: tokens } = await admin
    .from("meta_tokens")
    .select("access_token")
    .order("created_at", { ascending: true });
  for (const row of tokens ?? []) {
    const t = (row as { access_token?: string | null })?.access_token;
    if (t && t.trim()) out.push(t.trim());
  }

  const { data: settings } = await admin
    .from("automation_settings")
    .select("meta_access_token")
    .eq("id", true)
    .maybeSingle();
  const legacy = (settings as { meta_access_token?: string | null } | null)
    ?.meta_access_token?.trim();
  if (legacy) out.push(legacy);

  const env = Deno.env.get("META_ACCESS_TOKEN");
  if (env && env.trim()) out.push(env.trim());

  // dedup, preserve order
  return Array.from(new Set(out));
}

/**
 * Try each Meta token until the callback returns ok. Returns the first
 * successful payload along with the token used. If all fail returns the last
 * error message.
 */
export async function tryMetaTokens<T>(
  tokens: string[],
  fn: (token: string) => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
): Promise<{ ok: true; data: T; token: string } | { ok: false; error: string }> {
  let lastError = "Meta token не настроен";
  for (const t of tokens) {
    try {
      const r = await fn(t);
      if (r.ok) return { ok: true, data: r.data, token: t };
      lastError = r.error;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false, error: lastError };
}
