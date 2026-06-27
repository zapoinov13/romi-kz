// Generate ad copy (headline / primary_text / description / suggested CTA)
// from a creative image using the project's OpenAI key (gpt-4o-mini Vision).
//
// Body:
// {
//   project_id: string,
//   image_base64: string,        // raw base64 (no data: prefix) of JPEG/PNG
//   mime?: string,               // default image/jpeg
//   goal?: string,               // ads goal (whatsapp | site-leads | meta-form | traffic ...)
//   cta_options?: string[],      // allowed CTAs in current goal
//   current_cta?: string,
//   language?: string,           // default "ru"
//   brand_hint?: string,
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { AUTH_CORS_HEADERS, requireUser, requireProjectAccess } from "../_lib/auth.ts";
import { decryptApiKey } from "../_lib/cf-crypto.ts";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...AUTH_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const SYS = `Ты копирайтер performance-рекламы Meta Ads.
По одной картинке креатива (фото или кадр из видео) сгенерируй короткие тексты для запуска.
Правила:
- Язык ответа строго заданный в "language" (по умолчанию русский).
- Никаких длинных тире (— или –), только обычный дефис "-".
- Без эмодзи, если в брифе явно не сказано иначе.
- headline: до 40 символов, цепляющий, без точки в конце.
- primary_text: до 500 символов, продающий. ОБЯЗАТЕЛЬНО разбей на 2-4 коротких абзаца (1-3 строки каждый), разделяй абзацы двойным переводом строки "\n\n". Не лепи всё одним блоком. Структура: 1) крючок/боль, 2) оффер/выгода, 3) короткий CTA-абзац.
- description: до 30 символов, конкретика/УТП.
- suggested_cta: ВЫБРАТЬ ровно одно значение из переданного "cta_options" (если не передан - вернуть пустую строку).
Верни СТРОГО JSON по схеме без markdown.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: AUTH_CORS_HEADERS });

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const projectId = String(body?.project_id || "");
  const imageB64 = String(body?.image_base64 || "");
  const mime = String(body?.mime || "image/jpeg");
  const extraFrames: string[] = Array.isArray(body?.extra_frames_base64)
    ? body.extra_frames_base64.filter((s: unknown) => typeof s === "string" && s.length > 100)
    : [];
  const videoB64 = typeof body?.video_base64 === "string" ? body.video_base64 : "";
  const videoMime = String(body?.video_mime || "video/mp4");
  const goal = String(body?.goal || "");
  const ctaOptions: string[] = Array.isArray(body?.cta_options) ? body.cta_options : [];
  const language = String(body?.language || "ru");
  const brandHint = String(body?.brand_hint || "");

  if (!projectId) return json({ error: "project_id required" }, 400);
  if (!imageB64 || imageB64.length < 100) return json({ error: "image_base64 required" }, 400);

  const acc = await requireProjectAccess(auth.authHeader, projectId);
  if (!acc.ok) return acc.response;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: keyRow, error: keyErr } = await admin
    .from("content_factory_provider_keys")
    .select("api_key_encrypted, is_enabled")
    .eq("project_id", projectId)
    .eq("provider", "openai")
    .maybeSingle();

  if (keyErr) return json({ error: keyErr.message }, 500);
  if (!keyRow?.api_key_encrypted) {
    return json({
      error: "no_openai_key",
      message: "Подключите ключ OpenAI в Настройках -> OpenAI",
    }, 400);
  }
  if (keyRow.is_enabled === false) {
    return json({ error: "openai_key_disabled", message: "Ключ OpenAI выключен в настройках" }, 400);
  }

  let apiKey: string;
  try { apiKey = await decryptApiKey(keyRow.api_key_encrypted); }
  catch { return json({ error: "Не удалось расшифровать ключ OpenAI" }, 500); }

  // Если пришло видео - транскрибируем звук через Whisper, чтобы понять,
  // о чём говорят в ролике.
  let transcript = "";
  if (videoB64 && videoB64.length > 200) {
    try {
      const bin = atob(videoB64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const ext = videoMime.includes("webm") ? "webm"
        : videoMime.includes("quicktime") || videoMime.includes("mov") ? "mov"
        : videoMime.includes("m4a") || videoMime.includes("mp4") ? "mp4"
        : "mp4";
      const fd = new FormData();
      fd.append("file", new Blob([bytes], { type: videoMime }), `creative.${ext}`);
      fd.append("model", "whisper-1");
      if (language) fd.append("language", language);
      fd.append("response_format", "text");
      const wResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
      });
      if (wResp.ok) {
        transcript = (await wResp.text()).trim();
      } else {
        const errTxt = await wResp.text();
        console.warn("[ads-generate-copy] whisper error", wResp.status, errTxt.slice(0, 300));
      }
    } catch (e) {
      console.warn("[ads-generate-copy] whisper exception", (e as Error).message);
    }
  }

  const isVideo = extraFrames.length > 0 || !!transcript;
  const userPrompt = [
    `language: ${language}`,
    goal ? `goal: ${goal}` : "",
    ctaOptions.length ? `cta_options: ${JSON.stringify(ctaOptions)}` : "",
    brandHint ? `brand_hint: ${brandHint}` : "",
    isVideo
      ? `Тебе передано ${1 + extraFrames.length} кадра(ов) из видео-креатива (начало, середина, конец) - проанализируй динамику.`
      : `Проанализируй изображение креатива.`,
    transcript
      ? `Транскрипт того, что говорят в видео:\n"""\n${transcript.slice(0, 4000)}\n"""\nОбязательно учти смысл речи при составлении текстов рекламы.`
      : "",
    `На основе всего этого напиши тексты для Meta Ads.`,
  ].filter(Boolean).join("\n");

  const imageBlocks = [
    { type: "image_url", image_url: { url: `data:${mime};base64,${imageB64}`, detail: "low" } },
    ...extraFrames.map((b) => ({
      type: "image_url" as const,
      image_url: { url: `data:image/jpeg;base64,${b}`, detail: "low" as const },
    })),
  ];


  const dataUrl = `data:${mime};base64,${imageB64}`;

  const oaBody = {
    model: "gpt-4o-mini",
    temperature: 0.7,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ad_copy",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            headline: { type: "string" },
            primary_text: { type: "string" },
            description: { type: "string" },
            suggested_cta: { type: "string" },
            creative_summary: { type: "string" },
          },
          required: ["headline", "primary_text", "description", "suggested_cta", "creative_summary"],
        },
      },
    },
    messages: [
      { role: "system", content: SYS },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
        ],
      },
    ],
  };

  let oaResp: Response;
  try {
    oaResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(oaBody),
    });
  } catch (e) {
    return json({ error: "openai_network", message: String((e as Error).message || e) }, 502);
  }

  const oaText = await oaResp.text();
  if (!oaResp.ok) {
    return json({
      error: "openai_error",
      status: oaResp.status,
      message: oaText.slice(0, 500),
    }, oaResp.status === 401 ? 400 : 502);
  }

  let parsed: any;
  try { parsed = JSON.parse(oaText); } catch { return json({ error: "openai_bad_json" }, 502); }
  const content = parsed?.choices?.[0]?.message?.content;
  if (!content) return json({ error: "openai_empty" }, 502);

  let out: any;
  try { out = JSON.parse(content); } catch { return json({ error: "ai_bad_json", raw: content }, 502); }

  // Sanitize: trim length, strip em-dashes per project rule.
  const stripDashes = (s: string) => String(s || "").replace(/[—–]/g, "-");
  const oneLine = (s: string, max: number) => stripDashes(s).replace(/\s+/g, " ").trim().slice(0, max);
  const multiLine = (s: string, max: number) => {
    let t = stripDashes(s).replace(/\r\n/g, "\n");
    // collapse 3+ newlines to 2, trim spaces on each line
    t = t.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trimEnd()).join("\n");
    t = t.replace(/\n{3,}/g, "\n\n").trim();
    return t.slice(0, max);
  };
  const headline = oneLine(out.headline, 40);
  const primary_text = multiLine(out.primary_text, 500);
  const description = oneLine(out.description, 30);
  let suggested_cta = String(out.suggested_cta || "").trim();
  if (ctaOptions.length && !ctaOptions.includes(suggested_cta)) suggested_cta = "";

  return json({
    ok: true,
    headline,
    primary_text,
    description,
    suggested_cta,
    creative_summary: oneLine(out.creative_summary, 1000),
  });
});
