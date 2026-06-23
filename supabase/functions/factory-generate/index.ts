// Контент-завод: генерация изображений через Lovable AI Gateway (Nano Banana / Gemini 3 Image)
// и автодоставка в Telegram-бота проекта.
//
// Заменяет n8n workflow «Clony AI». Принимает payload из CreateStep3 как есть
// (route, finalPrompt/prompt, image_urls, request_id, project_id, style_label, ...)
// и возвращает { image_url } — фронт читает поле через extractImageUrl(data).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { AUTH_CORS_HEADERS, requireUser, requireProjectAccess } from "../_lib/auth.ts";
import { decryptApiKey } from "../_lib/cf-crypto.ts";
import { adapters, ProviderError, type ProviderId } from "../_lib/cf-providers.ts";
import { DEFAULT_BRIEFS, type ContentType } from "../_lib/cf-default-briefs.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const ALLOWED_MODELS = new Set([
  "google/gemini-2.5-flash-image",          // Nano Banana — дёшево и быстро
  "google/gemini-3.1-flash-image-preview",  // Nano Banana 2 — pro качество
]);
// Nano Banana 2 — единственный, кто терпимо рендерит кириллицу без «иероглифов».
const DEFAULT_MODEL = "google/gemini-3.1-flash-image-preview";
const BUCKET = "content-factory-generated";
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 365; // 1 год

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...AUTH_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Полный payload из CreateStep3 — оставляем как Record, чтобы не дёргать схему.
type GenInput = Record<string, unknown> & {
  project_id?: string;
  request_id?: string;
  prompt?: string;
  finalPrompt?: string;
  aspect?: string;
  aspect_ratio?: string;
  model?: string;
  image_urls?: string[];
  style_label?: string;
  style_id?: string;
  type_title?: string;
  typeId?: string;
  language?: string;
  slides?: number;
  image_count?: number;
  variants?: number;
  text_blocks?: Array<{ role?: string; text?: string }>;
  overlay_text?: string;
  headline?: string;
  cta?: string;
  logo_url?: string;
  people_photo_urls?: string[];
  product_photo_urls?: string[];
};

const LANG_NAME: Record<string, string> = {
  ru: "Russian (Cyrillic)",
  kz: "Kazakh (Cyrillic)",
  en: "English (Latin)",
};

/**
 * Карусель — это ОДНА история, разложенная на 5–7 слайдов.
 * Каждому слайду нужна своя роль в нарративе, иначе модель просто
 * клепает 5 одинаковых баннеров.
 */
function carouselBeat(index: number, total: number): { role: string; brief: string } {
  // Нормализованная схема: hook → problem → story/proof → offer → cta.
  if (index === 0) {
    return {
      role: "HOOK (slide 1)",
      brief: "Cover slide. Big bold scroll-stopping headline (1 short line), intriguing visual. Goal: make user swipe. No CTA yet, no offer details.",
    };
  }
  if (index === total - 1) {
    return {
      role: "CTA (final slide)",
      brief: "Closing slide. Clear call-to-action, swipe-up / link in bio / DM us style. Big button-like text. Keep visual minimal, brand-forward.",
    };
  }
  if (index === total - 2) {
    return {
      role: "OFFER (pre-final slide)",
      brief: "Concrete offer / value / result. Show price, package, transformation or key benefit visually. This is where the user decides.",
    };
  }
  // Середина — раскрытие: проблема → решение → доказательство.
  const middleIndex = index; // 1..total-3
  const beats = [
    {
      role: "PROBLEM (slide 2)",
      brief: "Name the pain / mistake / common situation the audience recognizes. Empathetic, not salesy. One short headline + supporting visual.",
    },
    {
      role: "INSIGHT / STORY",
      brief: "Reveal a non-obvious insight or short story that reframes the problem. Build trust and curiosity.",
    },
    {
      role: "SOLUTION / METHOD",
      brief: "Show HOW the product/method solves it. Short numbered step or labelled diagram look. Visually structured.",
    },
    {
      role: "PROOF / RESULT",
      brief: "Social proof, before/after, numbers, testimonial vibe. Tangible result the viewer wants.",
    },
  ];
  const beat = beats[Math.min(middleIndex - 1, beats.length - 1)];
  return beat;
}

function isCarousel(input: GenInput): boolean {
  const t = String(input.typeId ?? input.content_type ?? "").toLowerCase();
  return t.includes("carousel");
}

/**
 * Аннотируем референс-картинки ролями (logo / face / product / extra),
 * чтобы Nano Banana понимала, что с ними делать. Без этого модель часто
 * игнорирует логотип и не подставляет лица из people_photo_urls.
 */
function buildReferences(input: GenInput): Array<{ url: string; role: "logo" | "face" | "product" | "extra" }> {
  const refs: Array<{ url: string; role: "logo" | "face" | "product" | "extra" }> = [];
  const seen = new Set<string>();
  const push = (url: unknown, role: "logo" | "face" | "product" | "extra") => {
    if (typeof url !== "string") return;
    if (!/^https?:\/\//.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    refs.push({ url, role });
  };
  push(input.logo_url, "logo");
  if (Array.isArray(input.people_photo_urls)) input.people_photo_urls.forEach((u) => push(u, "face"));
  if (Array.isArray(input.product_photo_urls)) input.product_photo_urls.forEach((u) => push(u, "product"));
  // image_urls — общий мешок (фронт уже мерджит logo+people+product+brand).
  // То, что попадёт сюда повторно — фильтрует seen-set. Остальное помечаем extra.
  if (Array.isArray(input.image_urls)) input.image_urls.forEach((u) => push(u, "extra"));
  return refs.slice(0, 6);
}

function buildReferenceDirectives(refs: Array<{ url: string; role: string }>): string {
  if (refs.length === 0) return "";
  const lines = refs.map((r, i) => {
    const idx = i + 1;
    switch (r.role) {
      case "logo":
        return `Image ${idx} = BRAND LOGO. You MUST place this exact logo, unmodified (same shape, same colors, same proportions), on EVERY generated slide. Pick a corner that doesn't overlap key text/faces. Match the overall creative palette and typography to the logo's style.`;
      case "face":
        return `Image ${idx} = REAL PERSON REFERENCE. The protagonist of the generated creative MUST be visually identical to this person: same face shape, same eyes, same nose, same hair color and length, same skin tone, same ethnicity, same approximate age. This is a real human, NOT a stylized character. Do NOT invent a different person, do NOT change ethnicity, do NOT use a generic stock model. If multiple face references are provided, treat them as the SAME person from different angles and stay faithful to that identity.`;
      case "product":
        return `Image ${idx} = PRODUCT REFERENCE. Render this exact product prominently in the creative — same shape, packaging, colors. It must be recognizable.`;
      default:
        return `Image ${idx} = additional reference for mood/style/context.`;
    }
  });
  const hasFace = refs.some((r) => r.role === "face");
  const tail = hasFace
    ? "\nIDENTITY LOCK: the face reference is the single most important constraint. If you cannot preserve the exact identity, do not generate the slide."
    : "";
  return `Reference images (provided as inputs, in order):\n${lines.join("\n")}${tail}`;
}

/**
 * Собираем «жёсткие» инструкции для модели по тексту на креативе.
 * Цель — не получать кракозябры и переставленные буквы в кириллице.
 */
function buildTextDirectives(input: GenInput, slideIndex: number, slidesTotal: number): string {
  const lang = String(input.language ?? "ru").toLowerCase();
  const langName = LANG_NAME[lang] ?? LANG_NAME.ru;
  const blocks: string[] = [];
  const seen = new Set<string>();
  // Жёсткий кап на длину одного блока: длинные фразы на кириллице модель
  // ломает почти всегда. Лучше короткий ударный заголовок, чем стена кракозябр.
  const MAX_WORDS_PER_BLOCK = 5;
  const trimWords = (t: string) => {
    const words = t.split(/\s+/).filter(Boolean);
    return words.slice(0, MAX_WORDS_PER_BLOCK).join(" ");
  };
  const push = (role: string, text?: string | null) => {
    let t = (text ?? "").trim();
    if (!t) return;
    // нормализация: убираем длинные тире (mem://index Core правило)
    t = t.replace(/[\u2014\u2013]/g, "-");
    // снимаем метки ролей вида «Хук:», «Оффер:», «CTA:» из текста
    t = t.replace(/^(хук|стори|оффер|cta|заголовок|подзаголовок|headline|caption)\s*[:\-]\s*/i, "").trim();
    t = trimWords(t);
    if (!t) return;
    const key = `${role}::${t}`;
    if (seen.has(key)) return;
    seen.add(key);
    blocks.push(`- ${role}: «${t}»`);
  };
  if (Array.isArray(input.text_blocks)) {
    for (const b of input.text_blocks) {
      push(String(b?.role ?? "TEXT").toUpperCase(), b?.text);
    }
  }
  push("HEADLINE", input.headline);
  push("OVERLAY", input.overlay_text);
  push("CTA", input.cta);

  let slideHeader = "";
  if (slidesTotal > 1) {
    if (isCarousel(input)) {
      const beat = carouselBeat(slideIndex, slidesTotal);
      slideHeader = [
        `This is slide ${slideIndex + 1} of ${slidesTotal} in an Instagram CAROUSEL — ONE coherent story told across all slides.`,
        `Slide role: ${beat.role}. ${beat.brief}`,
        `Visual continuity is mandatory: keep the SAME brand colors, SAME font family, SAME grid/margins, SAME illustration/photo style as the other slides. Same protagonist if a person is featured.`,
        `Each slide must clearly progress the narrative — do NOT repeat the previous slide's content or layout. Do NOT put the final CTA on intermediate slides; do NOT put the hook headline on later slides.`,
      ].join("\n");
    } else {
      slideHeader = `Variant ${slideIndex + 1} of ${slidesTotal}. Produce a DIFFERENT creative direction (composition, color accent or angle) from the other variants while keeping the same brand identity.`;
    }
  }

  const rules = [
    `Language for ALL on-image text: ${langName}. Never mix scripts.`,
    "ZERO TOLERANCE for misspellings. Russian/Cyrillic on AI images is the #1 failure mode. Render every letter EXACTLY as written, in the EXACT order, NO substitutions, NO reordering, NO extra letters, NO missing letters, NO Latin letters inside Cyrillic words.",
    "Before painting a word: mentally compare it letter-by-letter to the source. If ANY letter would be wrong, swapped, doubled or missing - DROP THAT ENTIRE WORD AND LEAVE EMPTY SPACE. An empty area is strictly better than a misspelled word. Misspelled Russian text = automatic reject.",
    "Do NOT translate, do NOT paraphrase, do NOT auto-correct, do NOT abbreviate, do NOT add words that are not in the source, do NOT add captions like 'subtitle' or 'tagline'.",
    "Maximum on-image text: ONE short headline (up to 5 words) + optional ONE accent word in color. NO paragraphs, NO bullet lists, NO body text. Everything else goes into the caption, NOT onto the image.",
    "Do NOT use long dashes '—' or '–'. Use only the regular hyphen '-' or whitespace.",
    "Use a single clean sans-serif font with strong legibility (Inter, Manrope, SF Pro, Montserrat ExtraBold). Big, bold, high contrast. Dark scrim/plate under the text if the background is busy.",
    "Do NOT draw slide numbers ('1/5', '01/02', 'Slide 2'), watermarks, fake logos, UI chrome, lorem ipsum or placeholder text.",
    "Do NOT print role labels ('Хук:', 'Оффер:', 'CTA:', 'Заголовок:') - those are roles, never visible text.",
    "Do NOT duplicate the same phrase twice on one slide (no 'headline: headline' patterns).",
  ];

  return [
    slideHeader,
    blocks.length
      ? `Render the following text blocks EXACTLY (verbatim, character-by-character, case-sensitive). Each block appears ONCE. Do not add any other words to the image. If you cannot render a Cyrillic word with 100% correct spelling - LEAVE EMPTY SPACE in its place instead of guessing:\n${blocks.join("\n")}`
      : "Do NOT add any text to the image. No headline, no caption, no CTA, no labels, no watermark. A clean text-free composition is required.",
    `Text quality rules:\n${rules.map((r) => `- ${r}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
}

/**
 * STYLE BIBLE — генерится один раз на всю карусель и инжектится в каждый слайд.
 * Это фиксирует палитру/шрифт/композиционную сетку, чтобы все слайды выглядели
 * как ОДИН набор, а не 5 случайных баннеров от разных дизайнеров.
 */
function buildStyleBible(input: GenInput, requestId: string): string {
  // Детерминированный выбор из нескольких выверенных пресетов на основе requestId,
 // чтобы каждый запуск был стабильным, но запуски различались.
  const palettes = [
    { name: "Warm Cream", bg: "#F4ECE0", ink: "#1A1A1A", accent: "#E2562B" },
    { name: "Deep Night", bg: "#0E1116", ink: "#F5F5F5", accent: "#FFB23F" },
    { name: "Clean Studio", bg: "#FFFFFF", ink: "#101010", accent: "#2F5BFF" },
    { name: "Sage Editorial", bg: "#E8EBE0", ink: "#1F2A1C", accent: "#C24A2F" },
    { name: "Soft Pink", bg: "#F7E6E1", ink: "#2A1A1A", accent: "#1A1A1A" },
  ];
  const fonts = [
    "Inter Tight, geometric sans-serif, weights 400 + 800",
    "Manrope, modern sans-serif, weights 500 + 800",
    "Söhne / Suisse Int'l style sans-serif, weights 400 + 700",
  ];
  const hash = [...requestId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const palette = palettes[hash % palettes.length];
  const font = fonts[(hash >> 3) % fonts.length];

  return [
    `STYLE BIBLE (LOCKED FOR ALL SLIDES — do not deviate):`,
    `- Palette "${palette.name}": background ${palette.bg}, primary text ${palette.ink}, single accent ${palette.accent}. No other colors except photographic skin/product tones.`,
    `- Typography: ${font}. ONE font family across every slide. Headline very large (≈ 12-16% of canvas height), body small and tight.`,
    `- Layout grid: generous margins (≈ 8% padding), left-aligned text, one clear focal element per slide. Same margins/grid on every slide.`,
    `- Aesthetic: editorial Instagram carousel, premium minimal, like Apple / Aesop / Notion marketing. NOT stocky, NOT AI-collage, NOT busy.`,
    `- Continuity: every slide shares the SAME background tone, SAME font, SAME accent treatment, SAME logo position (bottom-left small). If a person is featured, it is the SAME person on every slide.`,
    `- Do NOT add decorative noise: no random gradients, no sparkles, no emojis, no fake UI mockups, no stock-photo collages.`,
  ].join("\n");
}

/**
 * Один заход в Lovable AI Gateway за PNG (b64).
 * Gemini image-модели на Gateway маршрутятся через OpenRouter chat-completions,
 * поэтому используем messages + modalities; ответ — choices[0].message.images[].image_url.url
 */
async function generateOne(
  prompt: string,
  aspectRatio: string,
  model: string,
  lovableKey: string,
  references: Array<{ url: string; role: string }>,
): Promise<{ ok: true; b64Url: string } | { ok: false; error: string; status: number }> {
  const textPart = aspectRatio
    ? `${prompt}\n\nAspect ratio: ${aspectRatio}.`
    : prompt;
  // Nano Banana поддерживает image inputs (редактирование/референсы).
  const content: unknown[] = [{ type: "text", text: textPart }];
  for (const r of references.slice(0, 6)) {
    content.push({ type: "image_url", image_url: { url: r.url } });
  }
  // 429-ретрай с бэк-оффом — Gateway часто кидает rate-limit при бурсте
  // (несколько стилей сразу или карусель 5+ слайдов).
  const delays = [0, 4_000, 10_000];
  let lastErr = "Gateway не ответил";
  let lastStatus = 502;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (res.status === 402) {
      return { ok: false, error: "Закончились кредиты Lovable AI. Пополни баланс воркспейса.", status: 402 };
    }
    if (res.status === 429) {
      lastErr = "Rate limit (429). Gateway перегружен.";
      lastStatus = 429;
      console.warn(`[factory-generate] 429 on attempt ${attempt + 1}, retrying...`);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Gateway ${res.status}: ${text.slice(0, 300)}`, status: res.status };
    }
    const data = await res.json();
    const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url || !url.startsWith("data:image/")) {
      return { ok: false, error: "Модель не вернула картинку", status: 502 };
    }
    return { ok: true, b64Url: url };
  }
  return { ok: false, error: lastErr, status: lastStatus };
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const [meta, b64] = dataUrl.split(",", 2);
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

async function sendToTelegram(botToken: string, chatId: string, bytes: Uint8Array, caption: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    if (caption) form.append("caption", caption.slice(0, 1024));
    form.append("photo", new Blob([bytes], { type: "image/png" }), "creative.png");
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) return { ok: false, error: j.description ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Карусель из 2–10 фото уходит в Telegram альбомом (sendMediaGroup).
 * Меньше — обычный sendPhoto.
 */
async function sendAlbumToTelegram(
  botToken: string,
  chatId: string,
  items: Array<{ bytes: Uint8Array; caption?: string }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (items.length === 0) return { ok: true };
  if (items.length === 1) return sendToTelegram(botToken, chatId, items[0].bytes, items[0].caption ?? "");
  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    const media = items.slice(0, 10).map((it, i) => ({
      type: "photo",
      media: `attach://photo_${i}`,
      caption: i === 0 ? (it.caption ?? "").slice(0, 1024) : undefined,
    }));
    form.append("media", JSON.stringify(media));
    items.slice(0, 10).forEach((it, i) => {
      form.append(`photo_${i}`, new Blob([it.bytes], { type: "image/png" }), `slide_${i + 1}.png`);
    });
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(40_000),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) return { ok: false, error: j.description ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Прогон через цепочку провайдеров проекта (Kie.AI → Gemini → OpenAI и т.д.).
 * Возвращает результат в том же формате, что и generateOne (data URL b64),
 * чтобы остальной pipeline (storage upload + telegram) работал без изменений.
 */
type ChainEntry = { provider: ProviderId; apiKey: string };
async function generateViaProviderChain(
  prompt: string,
  aspect: string,
  references: Array<{ url: string; role: string }>,
  chain: ChainEntry[],
  projectId: string,
  admin: ReturnType<typeof createClient>,
): Promise<
  | { ok: true; b64Url: string; provider: ProviderId }
  | { ok: false; error: string; status: number }
> {
  const attempts: string[] = [];
  for (const entry of chain) {
    try {
      const refUrls = references.map((r) => r.url).filter((u) => /^https?:\/\//.test(u)).slice(0, 4);
      const res = await adapters[entry.provider].generateImage(entry.apiKey, {
        prompt,
        aspect,
        image_urls: refUrls,
      });
      let b64Url: string | undefined;
      if (res.image_b64) {
        b64Url = `data:image/png;base64,${res.image_b64}`;
      } else if (res.image_url) {
        try {
          const f = await fetch(res.image_url);
          const buf = new Uint8Array(await f.arrayBuffer());
          let s = ""; for (const b of buf) s += String.fromCharCode(b);
          const mime = f.headers.get("content-type") || "image/png";
          b64Url = `data:${mime};base64,${btoa(s)}`;
        } catch (e) {
          attempts.push(`${entry.provider}: fetch image failed (${(e as Error).message})`);
          continue;
        }
      }
      if (!b64Url) {
        attempts.push(`${entry.provider}: empty result`);
        continue;
      }
      // Помечаем провайдера живым.
      await admin.from("content_factory_provider_keys").update({
        status: "ok", last_error: null, last_checked_at: new Date().toISOString(),
      }).eq("project_id", projectId).eq("provider", entry.provider);
      return { ok: true, b64Url, provider: entry.provider };
    } catch (e) {
      const pe = e as ProviderError;
      const kind = pe?.kind || "unknown";
      attempts.push(`${entry.provider}: ${kind} — ${(e as Error).message}`);
      console.warn(`[factory-generate] provider ${entry.provider} failed: ${kind}`);
      if (kind === "auth" || kind === "quota") {
        await admin.from("content_factory_provider_keys").update({
          status: kind === "quota" ? "quota" : "error",
          last_error: (e as Error).message?.slice(0, 500),
          last_checked_at: new Date().toISOString(),
        }).eq("project_id", projectId).eq("provider", entry.provider);
      }
      continue;
    }
  }
  return { ok: false, error: "Все провайдеры упали: " + attempts.join(" | "), status: 502 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: AUTH_CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let input: GenInput;
  try { input = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const projectId = String(input.project_id ?? "");
  const promptText = String(input.finalPrompt ?? input.prompt ?? "").trim();
  if (!projectId || !promptText) {
    return json({ error: "project_id и prompt/finalPrompt обязательны" }, 400);
  }

  const access = await requireProjectAccess(auth.authHeader, projectId);
  if (!access.ok) return access.response;

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) return json({ error: "LOVABLE_API_KEY не настроен" }, 500);

  const model = typeof input.model === "string" && ALLOWED_MODELS.has(input.model)
    ? input.model
    : DEFAULT_MODEL;
  const aspect = String(input.aspect_ratio ?? input.aspect ?? "1:1");
  const requestId = String(
    input.request_id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const styleLabel = String(input.style_label ?? "");
  const typeTitle = String(input.type_title ?? "");
  const references = buildReferences(input);
  const referenceDirectives = buildReferenceDirectives(references);

  // ---- Контент-тип, ТЗ, провайдеры проекта ----
  const VALID_TYPES: ContentType[] = ["facebook-ads","marketplace","insta-carousel","stories","warmup"];
  const rawType = String((input as any).typeId ?? (input as any).content_type ?? "");
  const contentType = (VALID_TYPES.includes(rawType as ContentType) ? rawType : "") as ContentType | "";
  const preferredProvider = String(
    (input as any).preferred_provider ?? "",
  ) as ProviderId | "";

  // Сколько слайдов рисуем: slides | image_count | variants. Cap 1..8.
  const rawSlides = Number(input.slides ?? input.image_count ?? input.variants ?? 1);
  const slidesTotal = Math.max(1, Math.min(8, Number.isFinite(rawSlides) ? Math.round(rawSlides) : 1));
  const styleBible = slidesTotal > 1 ? buildStyleBible(input, requestId) : "";

  // Готовим админ-клиент один раз — нужен и для аплоада, и для бота.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Подгружаем кастомный ТЗ-шаблон (если есть) — иначе дефолт.
  let briefSystem = "";
  if (contentType && (DEFAULT_BRIEFS as any)[contentType]) {
    briefSystem = (DEFAULT_BRIEFS as any)[contentType];
    try {
      const { data: brief } = await admin
        .from("content_factory_briefs")
        .select("system_prompt")
        .eq("project_id", projectId)
        .eq("content_type", contentType)
        .maybeSingle();
      if (brief?.system_prompt && brief.system_prompt.trim()) {
        briefSystem = brief.system_prompt.trim();
      }
    } catch (_) { /* ignore */ }
  }

  // Подгружаем все enabled-ключи провайдеров проекта в порядке приоритета.
  type ProviderEntry = { provider: ProviderId; apiKey: string };
  const providerChain: ProviderEntry[] = [];
  try {
    const { data: rows } = await admin
      .from("content_factory_provider_keys")
      .select("provider, api_key_encrypted, priority, is_enabled, status")
      .eq("project_id", projectId)
      .eq("is_enabled", true)
      .neq("status", "error")
      .order("priority", { ascending: true });
    for (const r of rows ?? []) {
      try {
        const k = await decryptApiKey((r as any).api_key_encrypted);
        providerChain.push({ provider: (r as any).provider, apiKey: k });
      } catch { /* skip undecryptable */ }
    }
    if (preferredProvider) {
      providerChain.sort((a, b) =>
        (b.provider === preferredProvider ? 1 : 0)
        - (a.provider === preferredProvider ? 1 : 0));
    }
  } catch (e) {
    console.warn("[factory-generate] provider chain load failed:", (e as Error).message);
  }

  // 1) Генерим слайды с ограниченной параллельностью.
  //    Последовательный режим упирается в 150s timeout edge-функции,
  //    параллель в 3 потока даёт ~3x ускорение без 429-бурста.
  const CONCURRENCY = 3;
  const slideResults: Array<{
    index: number;
    bytes: Uint8Array;
    imageUrl: string;
    objectPath: string;
  }> = [];
  const slideErrors: Array<{ index: number; error: string }> = [];
  let hardStopStatus: number | null = null;
  let hardStopError: string | null = null;
  // Anchor slide (#1) служит визуальным эталоном для всех остальных слайдов карусели.
  let anchorRef: { url: string; role: "extra" } | null = null;

  const runSlide = async (i: number) => {
    if (hardStopStatus) return;
    const directives = buildTextDirectives(input, i, slidesTotal);
    const anchorNote = anchorRef
      ? `STYLE ANCHOR: the LAST reference image is slide 1 of this exact carousel. Match its palette, font, margins, accent treatment and overall vibe 1:1. Only change the content per the slide role above.`
      : "";
    // Cap пользовательских референсов до 5, чтобы anchor (slide 1) гарантированно
    // влез в лимит 6 у generateOne.
    const refsForCall = anchorRef ? [...references.slice(0, 5), anchorRef] : references;
    const slidePrompt = [briefSystem, promptText, styleBible, referenceDirectives, anchorNote, directives]
      .filter(Boolean)
      .join("\n\n---\n");
    console.log(`[factory-generate] slide ${i + 1}/${slidesTotal} project=${projectId} refs=${references.length} chain=${providerChain.map(p=>p.provider).join(',')||'gateway'}`);
    const r = providerChain.length
      ? await generateViaProviderChain(slidePrompt, aspect, refsForCall, providerChain, projectId, admin)
      : await generateOne(slidePrompt, aspect, model, lovableKey, refsForCall);
    if (!r.ok) {
      console.error(`[factory-generate] slide ${i + 1} failed: ${r.error}`);
      if (r.status === 429 || r.status === 402) {
        hardStopStatus = r.status;
        hardStopError = r.error;
      }
      slideErrors.push({ index: i, error: r.error });
      return;
    }
    const { bytes } = dataUrlToBytes(r.b64Url);
    const suffix = slidesTotal > 1 ? `_${i + 1}` : "";
    const objectPath = `${projectId}/${requestId}${suffix}.png`;
    const up = await admin.storage.from(BUCKET).upload(objectPath, bytes, {
      contentType: "image/png",
      upsert: true,
    });
    if (up.error) {
      slideErrors.push({ index: i, error: `Storage upload failed: ${up.error.message}` });
      return;
    }
    const signed = await admin.storage.from(BUCKET).createSignedUrl(objectPath, SIGNED_URL_TTL_SEC);
    const imageUrl = signed.data?.signedUrl ?? null;
    if (!imageUrl) {
      slideErrors.push({ index: i, error: "Не удалось создать signed URL" });
      return;
    }
    slideResults.push({ index: i, bytes, imageUrl, objectPath });
    if (i === 0 && slidesTotal > 1 && !anchorRef) {
      // Передаём слайд 1 как референс остальным — в виде data URL, чтобы не
      // ждать публикации signed URL и не зависеть от внешних запросов.
      anchorRef = { url: r.b64Url, role: "extra" };
    }
  };

  const indices = Array.from({ length: slidesTotal }, (_, i) => i);
  // Слайд 1 рисуем строго первым (anchor), потом остальные параллельно — они
  // используют его картинку как style reference.
  if (slidesTotal > 1) {
    await runSlide(0);
    if (hardStopStatus) {
      return json({ error: hardStopError ?? "Rate limited", request_id: requestId }, hardStopStatus);
    }
    const rest = indices.slice(1);
    for (let start = 0; start < rest.length; start += CONCURRENCY) {
      const chunk = rest.slice(start, start + CONCURRENCY);
      await Promise.all(chunk.map(runSlide));
      if (hardStopStatus) {
        return json({ error: hardStopError ?? "Rate limited", request_id: requestId }, hardStopStatus);
      }
    }
  } else {
    await runSlide(0);
    if (hardStopStatus) {
      return json({ error: hardStopError ?? "Rate limited", request_id: requestId }, hardStopStatus);
    }
  }
  slideResults.sort((a, b) => a.index - b.index);

  if (slideResults.length === 0) {
    return json({
      error: slideErrors[0]?.error ?? "Модель не вернула ни одного слайда",
      request_id: requestId,
      slides_total: slidesTotal,
    }, 502);
  }

  // 2) Telegram — альбом, если слайдов >1.
  let telegramSent = false;
  let telegramError: string | undefined;
  const { data: bot, error: botErr } = await admin
    .from("project_telegram_bots")
    .select("bot_token, chat_id, is_active")
    .eq("project_id", projectId)
    .maybeSingle();
  if (botErr) {
    telegramError = `Не смог прочитать настройки бота: ${botErr.message}`;
    console.error(`[factory-generate] bot lookup error: ${botErr.message}`);
  } else if (!bot) {
    telegramError = "Telegram-бот не подключён для этого проекта (Настройки → Telegram).";
  } else if (!bot.is_active) {
    telegramError = "Telegram-бот выключен (Настройки → Telegram → включи переключатель).";
  } else if (!bot.bot_token || !bot.chat_id) {
    telegramError = "У бота нет токена или chat_id — пересохрани настройки.";
  } else {
    const caption = [typeTitle, styleLabel].filter(Boolean).join(" · ") || "Готовый креатив";
    const send = await sendAlbumToTelegram(
      bot.bot_token,
      bot.chat_id,
      slideResults.map((s, i) => ({ bytes: s.bytes, caption: i === 0 ? caption : undefined })),
    );
    telegramSent = send.ok;
    if (!send.ok) {
      telegramError = send.error;
      console.error(`[factory-generate] telegram send failed: ${send.error}`);
    } else {
      console.log(`[factory-generate] telegram ok, ${slideResults.length} slide(s) → ${bot.chat_id}`);
    }
  }

  const imageUrls = slideResults.map((s) => s.imageUrl);

  // Лог в журнал (best-effort).
  try {
    await admin.from("content_factory_generations").insert({
      project_id: projectId,
      request_id: requestId,
      content_type: contentType || null,
      provider_used: providerChain.length ? providerChain[0].provider : "lovable_gateway",
      model: providerChain.length ? null : model,
      prompt_snapshot: promptText.slice(0, 4000),
      input_payload: { aspect, slides: slidesTotal, type_title: typeTitle, style_label: styleLabel },
      result_urls: imageUrls,
      status: slideErrors.length === 0 ? "success" : "partial",
      error: slideErrors.length ? slideErrors[0]?.error?.slice(0, 500) : null,
      attempts: slideErrors.length ? slideErrors : null,
      created_by: auth.userId,
    });
  } catch (e) {
    console.warn("[factory-generate] log insert failed:", (e as Error).message);
  }

  return json({
    ok: true,
    // Обратная совместимость: первый слайд как одиночное поле.
    image_url: imageUrls[0],
    image_urls: imageUrls,
    slides_total: slidesTotal,
    slides_ready: slideResults.length,
    slides_failed: slideErrors,
    request_id: requestId,
    model,
    provider_used: providerChain.length ? providerChain[0].provider : "lovable_gateway",
    telegram_sent: telegramSent,
    telegram_error: telegramError,
  });
});