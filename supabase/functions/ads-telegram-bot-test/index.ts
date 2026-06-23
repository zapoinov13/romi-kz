// Шлёт тест-сообщение через бот управления рекламой.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { AUTH_CORS_HEADERS, requireUser, requireProjectAccess } from "../_lib/auth.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...AUTH_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: AUTH_CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: { project_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const projectId = body.project_id?.trim();
  if (!projectId) return json({ error: "project_id required" }, 400);

  const access = await requireProjectAccess(auth.authHeader, projectId);
  if (!access.ok) return access.response;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: bot, error } = await admin
    .from("project_ads_telegram_bots")
    .select("bot_token, chat_id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!bot) return json({ error: "Бот не настроен" }, 404);

  let ok = false;
  let errorMessage: string | null = null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${bot.bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: bot.chat_id,
        text:
          "✅ Бот управления рекламой подключён.\n\n" +
          "Команды:\n" +
          "• Пришли фото или видео + подпись \"запусти whatsapp\" — реклама на WhatsApp\n" +
          "• \"запусти instagram\" / \"messenger\" / \"site\"\n" +
          "• \"статус\" — последние запуски\n" +
          "• \"помощь\" — этот список",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const j = await res.json();
    if (res.ok && j.ok) ok = true;
    else errorMessage = j.description ?? `HTTP ${res.status}`;
  } catch (e) {
    errorMessage = (e as Error).message;
  }

  await admin
    .from("project_ads_telegram_bots")
    .update({ last_test_at: new Date().toISOString(), last_test_ok: ok, last_test_error: errorMessage })
    .eq("project_id", projectId);

  if (!ok) return json({ ok: false, error: errorMessage }, 400);
  return json({ ok: true });
});