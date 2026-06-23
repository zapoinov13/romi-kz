import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import {
  fetchAllMetaAdAccounts,
  mapAdAccounts,
  normalizeActId,
} from "../_lib/meta_list_ad_accounts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveMetaTokens(
  bodyToken: string | null | undefined,
): Promise<string[]> {
  if (bodyToken?.trim()) return [bodyToken.trim()];

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const out: string[] = [];

  const { data: tokens } = await admin
    .from("meta_tokens")
    .select("access_token")
    .order("created_at", { ascending: true });
  for (const row of tokens ?? []) {
    if (row?.access_token) out.push(row.access_token as string);
  }

  if (out.length === 0) {
    const { data: settings } = await admin
      .from("automation_settings")
      .select("meta_access_token")
      .eq("id", true)
      .maybeSingle();
    if (settings?.meta_access_token) out.push(settings.meta_access_token as string);
  }

  if (out.length === 0) {
    const env = Deno.env.get("META_ACCESS_TOKEN");
    if (env) out.push(env);
  }

  return out;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized", accounts: [] }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
        Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: "Unauthorized", accounts: [] }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const excludeRaw: string[] = Array.isArray(body.exclude_act_ids)
      ? body.exclude_act_ids
      : [];
    const exclude = excludeRaw.map((x) => normalizeActId(String(x)));

    const tokens = await resolveMetaTokens(
      typeof body.access_token === "string" ? body.access_token : null,
    );
    if (tokens.length === 0) {
      return jsonResponse({
        error: "Meta access token не настроен. Добавьте токен в Настройках → Facebook / Meta.",
        accounts: [],
      }, 400);
    }

    const allRows: Array<Record<string, unknown>> = [];
    const allSources: string[] = [];
    const identities: Array<{ id: string; name: string }> = [];
    const errors: string[] = [];

    for (const token of tokens) {
      try {
        const fetched = await fetchAllMetaAdAccounts(token);
        allRows.push(...fetched.rows);
        if (fetched.token_identity) identities.push(fetched.token_identity);
        for (const s of fetched.sources) allSources.push(s);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    // Дедуп по id
    const seen = new Set<string>();
    const dedup = allRows.filter((r) => {
      const id = normalizeActId(String((r as { id?: string }).id ?? (r as { account_id?: string }).account_id ?? ""));
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const accounts = mapAdAccounts(dedup as never, exclude);
    return jsonResponse({
      ok: true,
      accounts,
      sources: allSources,
      token_identities: identities,
      raw_count: dedup.length,
      tokens_used: tokens.length,
      errors: errors.length ? errors : undefined,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg, accounts: [] }, 500);
  }
});
