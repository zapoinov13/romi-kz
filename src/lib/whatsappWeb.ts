import { supabase } from "@/integrations/supabase/client";

const BRIDGE_URL =
  (import.meta.env.VITE_WA_WEB_BRIDGE_URL as string | undefined)?.replace(/\/$/, "") ||
  "/api/wa-web-bridge";

export type WaWebSession = {
  id: string;
  project_id: string;
  status: "disconnected" | "pairing" | "connected" | "error";
  phone: string | null;
  display_name: string | null;
  qr_data: string | null;
  qr_expires_at: string | null;
  worker_heartbeat_at: string | null;
  paired_at: string | null;
  last_error: string | null;
};

export type WaWebStatus = {
  ok: boolean;
  session: WaWebSession;
  worker_online: boolean;
  error?: string;
};

async function callBridge(action: string, body: Record<string, unknown> = {}) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Войдите в аккаунт");

  const res = await fetch(BRIDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as WaWebStatus & {
    error?: string;
    command_id?: string;
  };
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export async function fetchWaWebStatus(projectId: string): Promise<WaWebStatus> {
  return (await callBridge("status", { project_id: projectId })) as WaWebStatus;
}

export async function startWaWebPair(projectId: string): Promise<WaWebStatus> {
  return (await callBridge("start_pair", { project_id: projectId })) as WaWebStatus;
}

export async function logoutWaWeb(projectId: string): Promise<void> {
  await callBridge("logout", { project_id: projectId });
}

export async function sendWaWebMessage(params: {
  projectId: string;
  phone?: string;
  leadId?: string;
  text: string;
}): Promise<{ command_id?: string }> {
  return callBridge("send", {
    project_id: params.projectId,
    phone: params.phone,
    lead_id: params.leadId,
    text: params.text,
  });
}
