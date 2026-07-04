import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

/**
 * Green API webhook ingress on Vercel (bypasses Supabase edge function token block).
 * Green API webhookUrl: https://romi-kz.vercel.app/api/wa-webhook
 * Forwards copy to bot_webhook_url (n8n) after CRM ingest.
 */
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
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: "Supabase env not configured on Vercel" });
  }

  const body = req.body ?? {};
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("greenapi_ingest", { p_payload: body });
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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (
    serviceKey &&
    leadId &&
    (body.typeWebhook === "incomingMessageReceived" ||
      body.typeWebhook === "outgoingMessageReceived" ||
      body.typeWebhook === "outgoingAPIMessageReceived")
  ) {
    fetch(`${url.replace(/\/+$/, "")}/functions/v1/greenapi-proxy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "syncLeadName",
        lead_id: leadId,
        project_id: projectId ?? undefined,
      }),
    }).catch((e) => console.warn("wa name sync failed", e));
  }

  return res.status(200).json(data ?? { ok: true });
}
