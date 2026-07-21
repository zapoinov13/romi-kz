import { requireProjectAccess, requireUser } from "../_lib/auth.ts";
import { adminClient, WA_CORS, WA_GRAPH, waJson } from "../_lib/wa_cloud.ts";

/**
 * Status of WhatsApp Cloud account for a project/cabinet.
 * Body/query: project_id, cabinet_id?
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: WA_CORS });

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let projectId = "";
  let cabinetId = "";
  if (req.method === "GET") {
    const url = new URL(req.url);
    projectId = url.searchParams.get("project_id") ?? "";
    cabinetId = url.searchParams.get("cabinet_id") ?? "";
  } else {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    projectId = typeof body.project_id === "string" ? body.project_id : "";
    cabinetId = typeof body.cabinet_id === "string" ? body.cabinet_id : "";
  }

  if (!projectId) return waJson({ error: "project_id обязателен" }, 400);
  const access = await requireProjectAccess(auth.authHeader, projectId);
  if (!access.ok) return access.response;

  const admin = adminClient();
  let q = admin
    .from("whatsapp_accounts")
    .select(
      "id, project_id, cabinet_id, waba_id, phone_number_id, display_phone, display_name, onboarding_mode, connected, connected_at, updated_at, access_token",
    )
    .eq("project_id", projectId);
  if (cabinetId) q = q.eq("cabinet_id", cabinetId);
  const { data: rows, error } = await q.order("updated_at", { ascending: false }).limit(5);
  if (error) return waJson({ error: error.message }, 500);

  const row = (rows ?? [])[0] as {
    id: string;
    project_id: string;
    cabinet_id: string;
    waba_id: string;
    phone_number_id: string;
    display_phone: string | null;
    display_name: string | null;
    onboarding_mode: string;
    connected: boolean;
    connected_at: string | null;
    updated_at: string;
    access_token: string | null;
  } | undefined;

  if (!row) {
    return waJson({ ok: true, connected: false, account: null });
  }

  let liveOk: boolean | null = null;
  let liveError: string | null = null;
  if (row.access_token && row.phone_number_id) {
    try {
      const r = await fetch(
        `${WA_GRAPH}/${row.phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating&access_token=${encodeURIComponent(row.access_token)}`,
      );
      const j = await r.json().catch(() => ({}));
      liveOk = r.ok;
      if (r.ok) {
        if (j.display_phone_number && j.display_phone_number !== row.display_phone) {
          await admin.from("whatsapp_accounts").update({
            display_phone: j.display_phone_number,
            display_name: j.verified_name ?? row.display_name,
            connected: true,
            updated_at: new Date().toISOString(),
          }).eq("id", row.id);
          row.display_phone = j.display_phone_number;
          row.display_name = j.verified_name ?? row.display_name;
          row.connected = true;
        }
      } else {
        liveError = j?.error?.message ?? `HTTP ${r.status}`;
      }
    } catch (e) {
      liveError = e instanceof Error ? e.message : String(e);
      liveOk = false;
    }
  }

  return waJson({
    ok: true,
    connected: row.connected && liveOk !== false,
    liveOk,
    liveError,
    account: {
      id: row.id,
      project_id: row.project_id,
      cabinet_id: row.cabinet_id,
      waba_id: row.waba_id,
      phone_number_id: row.phone_number_id,
      display_phone: row.display_phone,
      display_name: row.display_name,
      onboarding_mode: row.onboarding_mode,
      connected: row.connected,
      connected_at: row.connected_at,
    },
  });
});
