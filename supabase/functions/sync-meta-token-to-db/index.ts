import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: accept either the service-role bearer (for internal cron / admin tooling)
  // or an authenticated admin JWT. Reject anyone else.
  const authHeader = req.headers.get("Authorization") ?? "";
  const presented = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  let allowed = false;
  if (presented && serviceKey && presented === serviceKey) {
    allowed = true;
  } else if (presented) {
    try {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${presented}` } } },
      );
      const { data, error } = await sb.auth.getClaims(presented);
      if (!error && data?.claims?.sub) {
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          serviceKey,
        );
        const { data: roleRow } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", data.claims.sub)
          .eq("role", "admin")
          .maybeSingle();
        if (roleRow) allowed = true;
      }
    } catch {
      // fallthrough to reject
    }
  }

  if (!allowed) return unauthorized();

  try {
    const token = Deno.env.get("META_ACCESS_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "META_ACCESS_TOKEN env not set" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error } = await admin
      .from("automation_settings")
      .upsert({ id: true, meta_access_token: token }, { onConflict: "id" });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
