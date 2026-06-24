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

  const userPrompt = [
    `language: ${language}`,
    goal ? `goal: ${goal}` : "",
    ctaOptions.length ? `cta_options: ${JSON.stringify(ctaOptions)}` : "",
    brandHint ? `brand_hint: ${brandHint}` : "",
    `Проанализируй изображение: что на нем, какой текст/оффер виден, кому подходит. На основе этого напиши тексты для Meta Ads.`,
  ].filter(Boolean).join("\n");

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
  const sanitize = (s: string, max: number) => String(s || "").replace(/[—–]/g, "-").trim().slice(0, max);
  const headline = sanitize(out.headline, 40);
  const primary_text = sanitize(out.primary_text, 500);
  const description = sanitize(out.description, 30);
  let suggested_cta = String(out.suggested_cta || "").trim();
  if (ctaOptions.length && !ctaOptions.includes(suggested_cta)) suggested_cta = "";

  return json({
    ok: true,
    headline,
    primary_text,
    description,
    suggested_cta,
    creative_summary: sanitize(out.creative_summary, 1000),
  });
});
