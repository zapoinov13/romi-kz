import { requireProjectAccess, requireUser } from "../_lib/auth.ts";
import { adminClient, WA_CORS, waJson } from "../_lib/wa_cloud.ts";

/**
 * Disconnect WhatsApp Cloud account from project/cabinet.
 * Body: { account_id } OR { project_id, cabinet_id }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: WA_CORS });
  if (req.method !== "POST" && req.method !== "DELETE") {
    return waJson({ error: "Method not allowed" }, 405);
  }

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const accountId = typeof body.account_id === "string" ? body.account_id.trim() : "";
  const projectId = typeof body.project_id === "string" ? body.project_id.trim() : "";
  const cabinetId = typeof body.cabinet_id === "string" ? body.cabinet_id.trim() : "";

  const admin = adminClient();

  if (accountId) {
    const { data: row } = await admin
      .from("whatsapp_accounts")
      .select("id, project_id")
      .eq("id", accountId)
      .maybeSingle();
    if (!row) return waJson({ error: "Аккаунт не найден" }, 404);
    const access = await requireProjectAccess(auth.authHeader, row.project_id);
    if (!access.ok) return access.response;

    const { error } = await admin.rpc("unbind_whatsapp_account", { p_account_id: accountId });
    if (error) return waJson({ error: error.message }, 500);
    return waJson({ ok: true, disconnected: true });
  }

  if (!projectId || !cabinetId) {
    return waJson({ error: "Укажите account_id или project_id + cabinet_id" }, 400);
  }

  const access = await requireProjectAccess(auth.authHeader, projectId);
  if (!access.ok) return access.response;

  const { data: row } = await admin
    .from("whatsapp_accounts")
    .select("id")
    .eq("project_id", projectId)
    .eq("cabinet_id", cabinetId)
    .maybeSingle();

  if (!row?.id) return waJson({ ok: true, disconnected: false, message: "Не был подключён" });

  const { error } = await admin.rpc("unbind_whatsapp_account", { p_account_id: row.id });
  if (error) return waJson({ error: error.message }, 500);
  return waJson({ ok: true, disconnected: true });
});
