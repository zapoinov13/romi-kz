import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ALLOWED = new Set(["ad-creative", "marketplace", "insta-carousel", "warmup"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const content_type = String(body?.content_type ?? "");
    const payload = (body?.payload && typeof body.payload === "object") ? body.payload : {};
    const chat_id = body?.chat_id ? String(body.chat_id) : null;

    if (!ALLOWED.has(content_type)) {
      return new Response(JSON.stringify({ error: `invalid content_type: ${content_type}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tpl } = await supabase
      .from("prompt_templates")
      .select("options")
      .eq("content_type", content_type)
      .maybeSingle();
    const slidesTotal = Number(tpl?.options?.slides_total ?? 1);

    const { data: job, error: insErr } = await supabase
      .from("generation_jobs")
      .insert({
        content_type,
        status: "queued",
        payload,
        slides_total: slidesTotal,
        chat_id,
        user_id: userId,
      })
      .select("id")
      .single();

    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fire-and-forget worker kick. Don't await to keep ingest fast.
    const workerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/clony-worker`;
    const workerSecret = Deno.env.get("CLONY_WORKER_SECRET") ?? "";
    fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Secret": workerSecret,
        Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
      },
      body: JSON.stringify({ job_id: job.id }),
    }).catch(() => {});

    return new Response(JSON.stringify({ job_id: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});