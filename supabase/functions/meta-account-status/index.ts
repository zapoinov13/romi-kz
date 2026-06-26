import { requireUser } from "../_lib/auth.ts";
import { normalizeActId } from "../_lib/meta_list_ad_accounts.ts";
import { fetchMetaAccountStatus } from "../_lib/meta_account_status.ts";
import { resolveMetaTokens, tryMetaTokens } from "../_lib/meta_tokens.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: { act_ids?: string[]; act_id?: string; access_token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const rawIds = Array.isArray(body.act_ids)
    ? body.act_ids
    : body.act_id
    ? [body.act_id]
    : [];
  const actIds = rawIds.map((x) => normalizeActId(String(x))).filter(Boolean);
  if (actIds.length === 0) return json({ error: "act_id or act_ids required" }, 400);
  if (actIds.length > 50) return json({ error: "max 50 act_ids per request" }, 400);

  const tokens = await resolveMetaTokens(body.access_token);
  if (tokens.length === 0) return json({ error: "Meta token не настроен" }, 400);

  const accounts = [];
  const errors: Record<string, string> = {};

  for (const actId of actIds) {
    const result = await tryMetaTokens(tokens, async (token) => {
      try {
        const data = await fetchMetaAccountStatus(actId, token);
        return { ok: true as const, data };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    });
    if (result.ok) {
      accounts.push(result.data);
    } else {
      errors[actId] = result.error;
    }
  }

  return json({
    ok: accounts.length > 0,
    accounts,
    errors: Object.keys(errors).length ? errors : undefined,
  });
});
