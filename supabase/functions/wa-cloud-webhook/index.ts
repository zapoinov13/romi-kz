import { adminClient, verifyMetaSignature, WA_CORS, waJson } from "../_lib/wa_cloud.ts";
import {
  extractCloudMessageText,
  findOrCreateLead,
  insertCommunication,
  normalizeWaPhone,
} from "../_lib/wa_cloud.ts";

/**
 * Meta Cloud API webhook for WhatsApp Coexistence.
 * GET — hub challenge; POST — signed notifications.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: WA_CORS });

  const url = new URL(req.url);

  // Meta webhook verification
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("META_WA_WEBHOOK_VERIFY_TOKEN")?.trim() ?? "";
    if (mode === "subscribe" && expected && token === expected && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return waJson({ error: "Verification failed" }, 403);
  }

  if (req.method !== "POST") {
    return waJson({ ok: true, hint: "POST Meta WhatsApp webhooks here" });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const valid = await verifyMetaSignature(rawBody, signature);
  if (!valid) {
    console.warn("wa-cloud-webhook: invalid signature");
    return waJson({ error: "invalid signature" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return waJson({ error: "Invalid JSON" }, 400);
  }

  // ACK immediately after signature check — process inline but keep handler lean
  try {
    await processPayload(body);
  } catch (e) {
    console.error("wa-cloud-webhook process error", e);
  }

  return waJson({ ok: true });
});

async function processPayload(body: Record<string, unknown>) {
  const object = body.object;
  if (object !== "whatsapp_business_account") return;

  const entries = (body.entry ?? []) as Array<Record<string, unknown>>;
  const admin = adminClient();

  for (const entry of entries) {
    const changes = (entry.changes ?? []) as Array<Record<string, unknown>>;
    for (const change of changes) {
      const field = String(change.field ?? "");
      const value = (change.value ?? {}) as Record<string, unknown>;

      if (field === "messages") {
        await handleMessages(admin, value);
      } else if (field === "smb_message_echoes") {
        await handleEchoes(admin, value);
      } else if (field === "smb_app_state_sync") {
        // contacts sync — v1 ignore
        console.log("wa-cloud-webhook: smb_app_state_sync received");
      } else if (field === "message_echoes") {
        await handleEchoes(admin, value);
      }
    }
  }
}

async function resolveAccount(
  admin: ReturnType<typeof adminClient>,
  phoneNumberId: string | null | undefined,
) {
  const pid = (phoneNumberId ?? "").trim();
  if (!pid) return null;
  const { data } = await admin
    .from("whatsapp_accounts")
    .select("id, project_id, cabinet_id, phone_number_id, connected")
    .eq("phone_number_id", pid)
    .maybeSingle();
  return data as {
    id: string;
    project_id: string;
    cabinet_id: string;
    phone_number_id: string;
    connected: boolean;
  } | null;
}

async function handleMessages(
  admin: ReturnType<typeof adminClient>,
  value: Record<string, unknown>,
) {
  const metadata = value.metadata as { phone_number_id?: string; display_phone_number?: string } | undefined;
  const account = await resolveAccount(admin, metadata?.phone_number_id);
  if (!account) {
    console.warn("wa-cloud-webhook: unknown phone_number_id", metadata?.phone_number_id);
    return;
  }

  const contacts = (value.contacts ?? []) as Array<{
    wa_id?: string;
    profile?: { name?: string };
  }>;
  const messages = (value.messages ?? []) as Array<Record<string, unknown>>;
  const statuses = (value.statuses ?? []) as Array<Record<string, unknown>>;

  for (const status of statuses) {
    const wamid = String(status.id ?? "");
    const st = String(status.status ?? "");
    if (!wamid || !st) continue;
    const map: Record<string, string> = {
      sent: "sent",
      delivered: "delivered",
      read: "read",
      failed: "failed",
    };
    await admin
      .from("communications")
      .update({ status: map[st] ?? st })
      .eq("external_id", wamid);
  }

  for (const msg of messages) {
    const from = normalizeWaPhone(String(msg.from ?? ""));
    if (!from) continue;
    const contact = contacts.find((c) => normalizeWaPhone(c.wa_id) === from);
    const name = contact?.profile?.name ?? null;
    const wamid = typeof msg.id === "string" ? msg.id : null;
    const text = extractCloudMessageText(msg);

    const leadId = await findOrCreateLead({
      admin,
      phoneDigits: from,
      name,
      projectId: account.project_id,
      cabinetId: account.cabinet_id,
      createIfMissing: true,
    });
    if (!leadId) continue;

    await insertCommunication({
      admin,
      leadId,
      direction: "in",
      text,
      externalId: wamid,
    });
  }
}

/** Messages sent from WhatsApp Business app — attach to existing lead only. */
async function handleEchoes(
  admin: ReturnType<typeof adminClient>,
  value: Record<string, unknown>,
) {
  const metadata = value.metadata as { phone_number_id?: string } | undefined;
  const account = await resolveAccount(admin, metadata?.phone_number_id);
  if (!account) return;

  const messages = (value.message_echoes ?? value.messages ?? []) as Array<Record<string, unknown>>;
  for (const msg of messages) {
    const to = normalizeWaPhone(String(msg.to ?? msg.recipient ?? msg.from ?? ""));
    if (!to) continue;
    const wamid = typeof msg.id === "string" ? msg.id : null;
    const text = extractCloudMessageText(msg);

    const leadId = await findOrCreateLead({
      admin,
      phoneDigits: to,
      projectId: account.project_id,
      cabinetId: account.cabinet_id,
      createIfMissing: false,
    });
    if (!leadId) continue;

    await insertCommunication({
      admin,
      leadId,
      direction: "out",
      text,
      externalId: wamid,
      isAuto: false,
    });
  }
}
