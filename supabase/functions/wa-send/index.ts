import { requireProjectAccess, requireUser } from "../_lib/auth.ts";
import { adminClient, digits, WA_CORS, WA_GRAPH, waJson } from "../_lib/wa_cloud.ts";

/**
 * Send WhatsApp text via Cloud API.
 * Body: { project_id, cabinet_id?, lead_id?, phone, message }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: WA_CORS });
  if (req.method !== "POST") return waJson({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const projectId = typeof body.project_id === "string" ? body.project_id.trim() : "";
  const cabinetId = typeof body.cabinet_id === "string" ? body.cabinet_id.trim() : "";
  const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
  let phone = typeof body.phone === "string" ? digits(body.phone) : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) return waJson({ error: "message обязателен" }, 400);

  const admin = adminClient();

  let resolvedProject = projectId;
  let resolvedCabinet = cabinetId;

  if (leadId) {
    const { data: lead } = await admin
      .from("leads")
      .select("id, phone, project_id, cabinet_id")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return waJson({ error: "Лид не найден" }, 404);
    resolvedProject = resolvedProject || (lead.project_id as string) || "";
    resolvedCabinet = resolvedCabinet || (lead.cabinet_id as string) || "";
    if (!phone) phone = digits(lead.phone as string);
  }

  if (!resolvedProject) return waJson({ error: "project_id обязателен" }, 400);
  if (!phone || phone.length < 8) return waJson({ error: "Некорректный телефон" }, 400);

  const access = await requireProjectAccess(auth.authHeader, resolvedProject);
  if (!access.ok) return access.response;

  let q = admin
    .from("whatsapp_accounts")
    .select("id, phone_number_id, access_token, connected, cabinet_id")
    .eq("project_id", resolvedProject)
    .eq("connected", true);
  if (resolvedCabinet) q = q.eq("cabinet_id", resolvedCabinet);
  const { data: rows, error } = await q.order("updated_at", { ascending: false }).limit(1);
  if (error) return waJson({ error: error.message }, 500);
  const account = (rows ?? [])[0] as {
    id: string;
    phone_number_id: string;
    access_token: string | null;
    connected: boolean;
    cabinet_id: string;
  } | undefined;

  if (!account?.access_token || !account.phone_number_id) {
    return waJson({
      error: "WhatsApp не подключён для этого проекта. Настройки → WhatsApp.",
      code: "WA_NOT_CONNECTED",
    }, 400);
  }

  const r = await fetch(`${WA_GRAPH}/${account.phone_number_id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { preview_url: false, body: message },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    return waJson({
      ok: false,
      error: j?.error?.message ?? `Meta API HTTP ${r.status}`,
      details: j,
    }, 400);
  }

  const wamid = (j?.messages?.[0]?.id as string | undefined) ?? null;
  return waJson({
    ok: true,
    wamid,
    phone_number_id: account.phone_number_id,
    cabinet_id: account.cabinet_id,
  });
});
