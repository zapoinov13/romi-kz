import { requireUser } from "../_lib/auth.ts";
import { normalizeActId } from "../_lib/meta_list_ad_accounts.ts";
import {
  attemptMetaAccountPayment,
  fetchMetaAccountStatus,
  metaBillingUrl,
} from "../_lib/meta_account_status.ts";
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

  let body: { act_id?: string; access_token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const actId = normalizeActId(String(body.act_id ?? ""));
  if (!actId) return json({ error: "act_id required" }, 400);

  const tokens = await resolveMetaTokens(body.access_token);
  if (tokens.length === 0) return json({ error: "Meta token не настроен" }, 400);

  const statusResult = await tryMetaTokens(tokens, async (token) => {
    try {
      const status = await fetchMetaAccountStatus(actId, token);
      return { ok: true as const, data: status };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });
  if (!statusResult.ok) return json({ error: statusResult.error }, 502);

  const status = statusResult.data;
  const billing_url = metaBillingUrl(actId);

  if (!status.needs_payment) {
    return json({
      ok: true,
      paid: false,
      message: "Кабинет активен, оплата не требуется",
      status,
      billing_url,
    });
  }

  const payResult = await tryMetaTokens(tokens, async (token) => {
    const attempt = await attemptMetaAccountPayment(actId, token);
    return { ok: true as const, data: attempt };
  });

  const attempt = payResult.ok ? payResult.data : { ok: false, message: payResult.error, attempted_api: false };

  let refreshed = status;
  if (attempt.ok) {
    const refresh = await tryMetaTokens(tokens, async (token) => {
      try {
        return { ok: true as const, data: await fetchMetaAccountStatus(actId, token) };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    });
    if (refresh.ok) refreshed = refresh.data;
  }

  return json({
    ok: attempt.ok,
    paid: attempt.ok,
    needs_manual: !attempt.ok,
    message: attempt.message,
    attempted_api: attempt.attempted_api,
    status: refreshed,
    billing_url,
  }, attempt.ok ? 200 : 202);
});
