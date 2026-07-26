/**
 * Thin edge stub — primary bridge is Vercel /api/wa-web-bridge
 * (Lovable edge deploy may be limited). Keep for future Supabase deploy.
 *
 * Deploy later:
 *   npx supabase functions deploy wa-web-bridge --project-ref rgttklitvvqsnlsakvzr
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-wa-web-key, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  return new Response(
    JSON.stringify({
      ok: true,
      hint: "Use https://romi-kz.vercel.app/api/wa-web-bridge — this edge stub is a placeholder",
    }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});

// silence unused import until full port
void createClient;
