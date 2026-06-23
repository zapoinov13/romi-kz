import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// State machine: queued -> routed -> generating -> qa -> compositing -> delivering -> done
// Self-chaining: after each step, fire-and-forget another invocation with same job_id.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ANON_KEY;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const CLOUDINARY_URL = Deno.env.get("CLOUDINARY_URL") ?? "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WORKER_SECRET = Deno.env.get("CLONY_WORKER_SECRET") ?? "";
const MAX_ITER = 30;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Job = {
  id: string;
  content_type: string;
  status: string;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
  slides_total: number;
  attempts: number;
  chat_id: string | null;
  user_id: string | null;
};

type SlidePlan = {
  idx?: number;
  prompt?: string;
  visual_prompt?: string;
  headline?: string;
  subhead?: string;
  cta?: string;
  badge?: string;
  footer?: string;
  role?: string;
  layout?: string;
  palette?: string;
  text_on_image?: string;
};

type SlideRow = {
  id: string;
  job_id: string;
  idx: number;
  status: string;
  prompt: string | null;
  image_url: string | null;
  qa_verdict: Record<string, unknown> | null;
  attempts: number;
};

function renderPrompt(tpl: string, job: Job): string {
  const p = (job.payload || {}) as Record<string, unknown>;
  const c = (job.context || {}) as Record<string, unknown>;
  const now = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date());
  const vars: Record<string, unknown> = {
    brief_text: p.brief_text ?? p.brief ?? "",
    brief: p.brief ?? p.brief_text ?? "",
    custom_text: p.custom_text ?? "",
    language: p.language ?? "RU",
    slides: p.slides ?? 1,
    aspect: p.aspect ?? "3:4",
    style: p.style ?? "",
    color: p.color ?? "",
    content_type: job.content_type ?? "",
    image_analysis: c.image_analysis ?? "",
    cta: p.cta ?? "",
    all_data: c.all_data ?? p.brief_text ?? p.brief ?? "",
    extra_instructions: p.extra_instructions ?? "",
    name: p.name ?? "",
    description: p.description ?? "",
    platform: p.platform ?? "",
    data: c.data ?? "",
    assets: JSON.stringify(p.assets ?? {}),
    now,
  };
  return String(tpl).replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? String(vars[k] ?? "") : ""));
}

async function claim(jobId: string): Promise<Job | null> {
  const lockCutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data, error } = await sb
    .from("generation_jobs")
    .update({ locked_at: new Date().toISOString() })
    .eq("id", jobId)
    .or(`locked_at.is.null,locked_at.lt.${lockCutoff}`)
    .not("status", "in", "(done,failed)")
    .select("*")
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as Job) ?? null;
}

async function release(jobId: string, patch: Record<string, unknown>) {
  await sb.from("generation_jobs").update({ ...patch, locked_at: null }).eq("id", jobId);
}

async function geminiText(model: string, prompt: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY is not configured");
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  if (!r.ok) throw new Error(`gemini ${model} ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const j = await r.json();
  return j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
}

async function geminiImage(prompt: string, refB64?: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY is not configured");
  const parts: unknown[] = [{ text: prompt }];
  if (refB64) parts.push({ inline_data: { mime_type: "image/jpeg", data: refB64 } });
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE"] } }),
    },
  );
  if (!r.ok) throw new Error(`gemini-image ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const j = await r.json();
  const part = j?.candidates?.[0]?.content?.parts?.find(
    (p: { inlineData?: { data?: string; mimeType?: string } }) => p?.inlineData?.data,
  );
  if (!part?.inlineData?.data) throw new Error("gemini-image: no image in response");
  return `data:${part.inlineData.mimeType ?? "image/png"};base64,${part.inlineData.data}`;
}

async function uploadToCloudinary(dataUrl: string, publicId: string): Promise<string> {
  if (!CLOUDINARY_URL) return dataUrl;
  const m = CLOUDINARY_URL.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  if (!m) return dataUrl;
  const [, apiKey, apiSecret, cloud] = m;
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureBase = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const sigBuf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(signatureBase));
  const signature = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const form = new FormData();
  form.append("file", dataUrl);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("public_id", publicId);
  form.append("signature", signature);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`cloudinary upload ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const secureUrl = j.secure_url as string;
  if (dataUrl.startsWith("data:image/svg+xml") && secureUrl.includes("/image/upload/")) {
    return secureUrl.replace("/image/upload/", "/image/upload/f_png/");
  }
  return secureUrl;
}

function textValue(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlEscape(value: unknown): string {
  return textValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(value: unknown, maxChars: number, maxLines: number): string[] {
  const words = textValue(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function normalizeOverlay(plan: SlidePlan, job: Job) {
  const fallbackHeadline = plan.text_on_image || plan.headline || plan.role || job.content_type;
  return {
    headline: textValue(plan.headline || plan.text_on_image || fallbackHeadline),
    subhead: textValue(plan.subhead),
    cta: textValue(plan.cta),
    badge: textValue(plan.badge),
    footer: textValue(plan.footer),
    role: textValue(plan.role),
    layout: textValue(plan.layout || (job.content_type === "ad-creative" ? "split-proof" : "editorial")),
    palette: textValue(plan.palette || "clony-red"),
  };
}

function buildVisualPrompt(plan: SlidePlan, job: Job): string {
  const base = textValue(plan.visual_prompt || plan.prompt || "premium commercial creative background");
  const contentHint = {
    "ad-creative": "high-end performance ad visual, realistic product or service scene, strong before and after contrast when relevant",
    marketplace: "clean marketplace product photography, premium ecommerce infographic background, product-centered composition",
    "insta-carousel": "premium Instagram carousel slide background, editorial composition, cinematic realistic visual",
    warmup: "warm social media story background, lifestyle editorial scene, emotional but clean composition",
  }[job.content_type] ?? "premium commercial visual";

  return `${base}\n\n${contentHint}. STRICTLY NO TEXT anywhere in the image. No letters, no words, no Cyrillic, no Latin, no numbers, no captions, no logos, no icons, no badges, no UI, no buttons, no price tags, no watermarks. Leave clean negative space for a designer to add typography later. Photorealistic or polished 3D, high-end advertising art direction, balanced lighting, sharp subject, professional composition.`;
}

function buildCompositeSvg(bgDataUrl: string, overlay: Record<string, unknown>, idx: number, total: number, contentType: string): string {
  const w = 1080;
  const h = 1350;
  const headline = wrapText(overlay.headline, contentType === "ad-creative" ? 20 : 24, 3);
  const subhead = wrapText(overlay.subhead, 42, 3);
  const cta = textValue(overlay.cta || (contentType === "ad-creative" ? "Узнать подробнее" : "Подробнее"));
  const badge = textValue(overlay.badge);
  const footer = textValue(overlay.footer);
  const dark = contentType === "marketplace" ? "#111827" : "#151515";
  const red = "#c8232c";
  const paper = "#f7f7f4";
  const safeHeadline = headline.map(xmlEscape);
  const safeSubhead = subhead.map(xmlEscape);
  const showCounter = total > 1;
  const titleY = contentType === "ad-creative" ? 104 : 126;
  const titleBlock = safeHeadline.map((line, i) => (
    `<text x="70" y="${titleY + i * 74}" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="900" letter-spacing="0" fill="${paper}">${line}</text>`
  )).join("");
  const subBlock = safeSubhead.map((line, i) => (
    `<text x="74" y="${h - 238 + i * 40}" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="600" letter-spacing="0" fill="#f2f2f2">${line}</text>`
  )).join("");
  const badgeBlock = badge
    ? `<rect x="70" y="52" width="${Math.min(520, 72 + badge.length * 22)}" height="46" rx="0" fill="${red}"/><text x="96" y="84" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="800" letter-spacing="0" fill="#fff">${xmlEscape(badge).toUpperCase()}</text>`
    : "";
  const ctaBlock = cta
    ? `<rect x="70" y="${h - 154}" width="${Math.min(650, 130 + cta.length * 24)}" height="78" rx="10" fill="${red}"/><text x="112" y="${h - 103}" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="900" letter-spacing="0" fill="#fff">${xmlEscape(cta).toUpperCase()}</text>`
    : "";
  const footerBlock = footer
    ? `<text x="70" y="${h - 34}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" letter-spacing="0" fill="#e8e8e8">${xmlEscape(footer)}</text>`
    : "";
  const counterBlock = showCounter
    ? `<text x="1010" y="82" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800" letter-spacing="0" fill="#fff">${idx}/${total}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.48"/><stop offset="0.46" stop-color="#000" stop-opacity="0.08"/><stop offset="1" stop-color="#000" stop-opacity="0.76"/></linearGradient>
    <linearGradient id="topBand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${dark}"/><stop offset="1" stop-color="${red}" stop-opacity="0.88"/></linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${dark}"/>
  <image href="${xmlEscape(bgDataUrl)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="${w}" height="${h}" fill="url(#shade)"/>
  <rect x="0" y="0" width="${w}" height="16" fill="url(#topBand)"/>
  ${badgeBlock}
  ${counterBlock}
  ${titleBlock}
  <rect x="0" y="${h - 330}" width="${w}" height="330" fill="${dark}" opacity="0.88"/>
  <rect x="70" y="${h - 296}" width="110" height="8" fill="${red}"/>
  ${subBlock}
  ${ctaBlock}
  ${footerBlock}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function chainSelf(jobId: string) {
  // Fire-and-forget self-invoke. Do not await.
  fetch(`${SUPABASE_URL}/functions/v1/clony-worker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Secret": WORKER_SECRET,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ job_id: jobId }),
  }).catch(() => {});
}

async function step(job: Job): Promise<void> {
  switch (job.status) {
    case "queued": {
      const { data: tpl } = await sb.from("prompt_templates").select("*").eq("content_type", job.content_type).maybeSingle();
      if (!tpl) throw new Error(`no prompt_template for ${job.content_type}`);

      const sys = renderPrompt(String(tpl.system_prompt ?? ""), job);
      const usr = renderPrompt(String(tpl.user_prompt ?? ""), job);
      const strategyModel = String(tpl.options?.strategy_model ?? "gemini-2.5-pro");
      const raw = await geminiText(strategyModel, `${sys}\n\n${usr}`);
      const jsonText = raw.replace(/^```json\s*|\s*```$/g, "").replace(/^```\s*|\s*```$/g, "").trim();
      let parsed: { slides?: SlidePlan[] };
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        throw new Error(`strategy LLM returned non-JSON: ${raw.slice(0, 200)}`);
      }
      const slides = parsed.slides ?? [];
      if (!slides.length) throw new Error("strategy returned 0 slides");

      const rows = slides.map((s, i) => ({
        job_id: job.id,
        idx: s.idx ?? i + 1,
        status: "pending",
        prompt: buildVisualPrompt(s, job),
        qa_verdict: normalizeOverlay(s, job),
      }));
      await sb.from("job_slides").insert(rows);
      await release(job.id, { status: "routed", slides_total: slides.length });
      return;
    }

    case "routed":
    case "generating": {
      const { data: slides } = await sb.from("job_slides").select("*").eq("job_id", job.id).order("idx", { ascending: true });
      const pending = (slides ?? []).find((s) => s.status === "pending");
      if (!pending) { await release(job.id, { status: "qa" }); return; }
      try {
        const dataUrl = await geminiImage(pending.prompt ?? "");
        await sb.from("job_slides").update({ status: "generated", image_url: dataUrl }).eq("id", pending.id);
      } catch (e) {
        const nextAttempts = (pending.attempts ?? 0) + 1;
        await sb.from("job_slides").update({
          attempts: nextAttempts,
          qa_verdict: { error: (e as Error).message },
          status: nextAttempts >= 3 ? "failed" : "pending",
        }).eq("id", pending.id);
      }
      await release(job.id, { status: "generating" });
      return;
    }

    case "qa": { await release(job.id, { status: "compositing" }); return; }

    case "compositing": {
      const { data: slides } = await sb.from("job_slides").select("*").eq("job_id", job.id).order("idx", { ascending: true });
      const generated = ((slides ?? []) as SlideRow[]).filter((s) => s.status === "generated" && s.image_url);
      const failed = ((slides ?? []) as SlideRow[]).filter((s) => s.status === "failed");
      if (failed.length) throw new Error(`${failed.length} slide(s) failed during generation`);

      for (const s of generated) {
        if (s.qa_verdict?.composited === true || !s.image_url) continue;
        const composite = buildCompositeSvg(s.image_url, s.qa_verdict ?? {}, s.idx, job.slides_total, job.content_type);
        let finalUrl = composite;
        try {
          finalUrl = await uploadToCloudinary(composite, `clony/${job.id}/final-${s.idx}`);
        } catch {
          finalUrl = composite;
        }
        await sb.from("job_slides").update({
          image_url: finalUrl,
          status: "composited",
          qa_verdict: { ...(s.qa_verdict ?? {}), composited: true },
        }).eq("id", s.id);
      }

      await release(job.id, { status: "delivering" });
      return;
    }

    case "delivering": {
      if (job.chat_id && TELEGRAM_BOT_TOKEN) {
        const { data: slides } = await sb.from("job_slides").select("idx,image_url").eq("job_id", job.id).order("idx", { ascending: true });
        for (const s of slides ?? []) {
          if (!s.image_url) continue;
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: job.chat_id, photo: s.image_url, caption: `Слайд ${s.idx}` }),
          }).catch(() => {});
        }
      }
      await release(job.id, { status: "done" });
      return;
    }

    default:
      await release(job.id, { status: "failed", error: `unknown status: ${job.status}` });
  }
}

async function processOne(jobId: string): Promise<{ status: string | null }> {
  const job = await claim(jobId);
  if (!job) return { status: null };
  if (job.attempts >= MAX_ITER) {
    await release(jobId, { status: "failed", error: `max iterations exceeded (${MAX_ITER})` });
    return { status: "failed" };
  }
  try {
    await sb.from("generation_jobs").update({ attempts: job.attempts + 1 }).eq("id", jobId);
    await step(job);
  } catch (e) {
    await release(jobId, { status: "failed", error: (e as Error).message });
    return { status: "failed" };
  }
  const { data: fresh } = await sb.from("generation_jobs").select("status").eq("id", jobId).maybeSingle();
  return { status: fresh?.status ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = req.headers.get("X-Worker-Secret");
  const authHeader = req.headers.get("Authorization");
  const cronAuthorized = WORKER_SECRET && secret === WORKER_SECRET;
  if (!cronAuthorized) {
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data, error } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (error || !data?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const body = await req.json().catch(() => ({}));
  const jobId = body?.job_id ? String(body.job_id) : undefined;
  if (!jobId) {
    return new Response(JSON.stringify({ error: "job_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { status } = await processOne(jobId);
    if (status && status !== "done" && status !== "failed") chainSelf(jobId);
    return new Response(JSON.stringify({ ok: true, status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
