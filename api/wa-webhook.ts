import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

/**
 * Green API webhook ingress on Vercel.
 * Validates per-instance webhook_token before calling greenapi_ingest (service role).
 * Mirrors token check from supabase/functions/greenapi-webhook/index.ts.
 */

function tokenFromAuthorization(header: string | null | undefined): string | null {
  if (!header?.trim()) return null;
  const h = header.trim();
  if (/^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, "").trim() || null;
  if (/^Basic\s+/i.test(h)) return h.replace(/^Basic\s+/i, "").trim() || null;
  return h;
}

function normalizeToken(t: string | null | undefined): string | null {
  if (!t?.trim()) return null;
  return t.trim().replace(/^Bearer\s+/i, "").replace(/^Basic\s+/i, "");
}

function tokensMatch(expected: string | null, presented: string | null): boolean {
  const a = normalizeToken(expected);
  const b = normalizeToken(presented);
  return !!a && !!b && a === b;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, hint: "POST Green API notifications here" });
  }

  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return res.status(500).json({ error: "Supabase service env not configured on Vercel" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const typeWebhook = String(body.typeWebhook ?? "");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Test pings from Green API have no token — allow them, no side effects.
  if (typeWebhook === "test" || !typeWebhook) {
    return res.status(200).json({ ok: true, skipped: typeWebhook || "empty" });
  }

  // Resolve instance + verify token before invoking any RPC.
  const instanceData = (body.instanceData ?? {}) as Record<string, unknown>;
  const idInstance = String(
    instanceData.idInstance ?? body.idInstance ?? "",
  ).trim();
  if (!idInstance) {
    return res.status(400).json({ error: "no idInstance" });
  }

  const { data: cfg } = await admin
    .from("whatsapp_config")
    .select("webhook_token")
    .eq("id_instance", idInstance)
    .maybeSingle();

  const expected =
    (cfg as { webhook_token?: string | null } | null)?.webhook_token?.trim() ||
    process.env.GREENAPI_WEBHOOK_TOKEN?.trim() ||
    null;

  const presented =
    tokenFromAuthorization(
      (req.headers["authorization"] as string | undefined) ||
        (req.headers["Authorization"] as unknown as string | undefined),
    ) ||
    (typeof req.query.token === "string" ? req.query.token : null) ||
    (typeof body.webhookUrlToken === "string" ? (body.webhookUrlToken as string) : null);

  if (!expected) {
    // No token configured yet — reject to avoid open ingress.
    console.warn("wa-webhook: no webhook_token configured for instance", idInstance);
    return res.status(403).json({ error: "webhook token not configured" });
  }
  if (!tokensMatch(expected, presented)) {
    console.warn("wa-webhook: token mismatch", { idInstance, hasPresented: !!presented });
    return res.status(403).json({ error: "invalid webhook token" });
  }

  const { data, error } = await admin.rpc("greenapi_ingest", { p_payload: body });
  if (error) {
    console.error("greenapi_ingest error", error.message);
    return res.status(500).json({ error: error.message, code: error.code });
  }

  const result = (data ?? { ok: true }) as {
    ok?: boolean;
    botWebhookUrl?: string | null;
    leadId?: string | null;
    projectId?: string | null;
  };
  const botUrl = result.botWebhookUrl?.trim();
  if (botUrl && botUrl !== `${url.replace(/\/+$/, "")}/functions/v1/greenapi-webhook`) {
    fetch(botUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch((e) => console.warn("bot forward failed", e));
  }

  const leadId = result.leadId?.trim();
  const projectId = result.projectId?.trim();
  if (
    leadId &&
    (typeWebhook === "incomingMessageReceived" ||
      typeWebhook === "outgoingMessageReceived" ||
      typeWebhook === "outgoingAPIMessageReceived")
  ) {
    fetch(`${url.replace(/\/+$/, "")}/functions/v1/greenapi-sync-name`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        lead_id: leadId,
        project_id: projectId ?? undefined,
      }),
    }).catch((e) => console.warn("wa name sync failed", e));
  }

  return res.status(200).json(data ?? { ok: true });
}
