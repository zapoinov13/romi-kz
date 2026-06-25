// Adapters for content-factory AI providers.
// Each adapter exposes:
//   - validate(apiKey): pings the provider to confirm the key works.
//   - generateImage(apiKey, opts): returns { url } or { base64 } and throws on
//     classified failure (auth / quota / rate-limit / other) so the orchestrator
//     can decide whether to fall back to the next provider.

export type ProviderId = "kie_ai" | "gemini" | "openai";

export class ProviderError extends Error {
  kind: "auth" | "quota" | "rate" | "server" | "bad_request" | "unknown";
  status: number;
  constructor(kind: ProviderError["kind"], status: number, msg: string) {
    super(msg);
    this.kind = kind;
    this.status = status;
  }
}

function classify(status: number, body: string): ProviderError["kind"] {
  if (status === 401 || status === 403) return "auth";
  if (status === 402 || /insufficient|balance|quota|credit/i.test(body)) return "quota";
  if (status === 429) return "rate";
  if (status >= 500) return "server";
  if (status >= 400) return "bad_request";
  return "unknown";
}

export interface GenInput {
  prompt: string;
  aspect?: string;      // "1:1" | "9:16" | "16:9" | "4:5" ...
  image_urls?: string[]; // reference images (for edits)
  n?: number;
}
export interface GenResult {
  image_b64?: string;   // base64 PNG without data: prefix
  image_url?: string;
  raw?: unknown;
}

// ============ Kie.AI =============================================
// Kie.AI proxies Nano Banana / Veo / GPT-Image via a unified API.
// Docs: https://docs.kie.ai
const KIE_BASE = "https://api.kie.ai";

export const kie = {
  async validate(apiKey: string) {
    const r = await fetch(`${KIE_BASE}/api/v1/chat/credit`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await r.text();
    if (!r.ok) throw new ProviderError(classify(r.status, text), r.status, text.slice(0, 300));
    let raw: any = undefined;
    try { raw = JSON.parse(text); } catch { /* */ }
    // Kie returns shapes like { code:200, data:{ credits: 1234 } } or { data:{ balance: 12.34 } }
    const amount = Number(
      raw?.data?.credits ?? raw?.data?.balance ?? raw?.credits ?? raw?.balance ?? raw?.data?.left ?? NaN
    );
    const balance = {
      amount: Number.isFinite(amount) ? amount : null,
      unit: "credits",
      currency: null as string | null,
      checked_at: new Date().toISOString(),
      raw,
    };
    return { ok: true, balance };
  },
  async generateImage(apiKey: string, opts: GenInput): Promise<GenResult> {
    // Use Nano Banana (gemini-2.5-flash-image) via Kie playground endpoint.
    const body: Record<string, unknown> = {
      model: "google/nano-banana",
      input: {
        prompt: opts.prompt,
        aspect_ratio: opts.aspect || "1:1",
        image_urls: opts.image_urls || [],
      },
    };
    const r = await fetch(`${KIE_BASE}/api/v1/playground/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new ProviderError(classify(r.status, text), r.status, text.slice(0, 500));
    const j = JSON.parse(text);
    // Kie returns either { code:200, data:{ taskId } } or wraps differently per endpoint.
    // Surface API-level errors (code !== 200) instead of swallowing them.
    if (typeof j?.code === "number" && j.code !== 200) {
      const msg = j?.msg || j?.message || JSON.stringify(j).slice(0, 300);
      throw new ProviderError(classify(j.code, msg), j.code, `Kie: ${msg}`);
    }
    const taskId =
      j?.data?.taskId || j?.data?.task_id || j?.taskId ||
      j?.data?.id || j?.data?.recordId || j?.data?.record_id;
    if (!taskId) {
      throw new ProviderError("server", 502, "Kie createTask: " + text.slice(0, 300));
    }
    // Poll up to 60s.
    for (let i = 0; i < 30; i++) {
      await new Promise((res) => setTimeout(res, 2000));
      const pr = await fetch(`${KIE_BASE}/api/v1/playground/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const pt = await pr.text();
      if (!pr.ok) throw new ProviderError(classify(pr.status, pt), pr.status, pt.slice(0, 500));
      const pj = JSON.parse(pt);
      const status = pj?.data?.state || pj?.data?.status;
      if (status === "success" || status === "succeeded") {
        // Kie returns result URLs in many shapes depending on model/endpoint version.
        // resultJson is often a JSON string, not an object.
        let rj: any = pj?.data?.resultJson;
        if (typeof rj === "string") {
          try { rj = JSON.parse(rj); } catch { /* keep as string */ }
        }
        const candidates: unknown[] = [
          rj?.resultUrls?.[0],
          rj?.resultUrl,
          rj?.urls?.[0],
          rj?.url,
          rj?.images?.[0]?.url,
          rj?.images?.[0],
          rj?.output?.[0],
          pj?.data?.resultUrls?.[0],
          pj?.data?.resultUrl,
          pj?.data?.result?.[0],
          pj?.data?.result?.resultUrls?.[0],
          pj?.data?.output?.[0],
          pj?.data?.images?.[0]?.url,
          pj?.data?.images?.[0],
          pj?.data?.url,
          pj?.resultUrls?.[0],
        ];
        const url = candidates.find((u) => typeof u === "string" && /^https?:\/\//i.test(u as string)) as string | undefined;
        if (!url) {
          const dbg = JSON.stringify(pj?.data ?? pj).slice(0, 400);
          throw new ProviderError("server", 502, "Kie: success but no image url — " + dbg);
        }
        return { image_url: url, raw: pj };
      }
      if (status === "fail" || status === "failed" || status === "error") {
        throw new ProviderError("server", 502, "Kie task failed: " + (pj?.data?.failMsg || ""));
      }
    }
    throw new ProviderError("server", 504, "Kie task timeout");
  },
};

// ============ Google Gemini ======================================
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

export const gemini = {
  async validate(apiKey: string) {
    const r = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(apiKey)}`);
    const t = await r.text();
    if (!r.ok) throw new ProviderError(classify(r.status, t), r.status, t.slice(0, 300));
    // Google Gemini API does not expose a balance endpoint — show as N/A.
    return {
      ok: true,
      balance: { amount: null, unit: null, currency: null, note: "Gemini не отдаёт баланс через API", checked_at: new Date().toISOString() },
    };
  },
  async generateImage(apiKey: string, opts: GenInput): Promise<GenResult> {
    const parts: unknown[] = [{ text: opts.prompt }];
    for (const u of opts.image_urls || []) {
      try {
        const resp = await fetch(u);
        const buf = new Uint8Array(await resp.arrayBuffer());
        let s = "";
        for (const b of buf) s += String.fromCharCode(b);
        parts.push({
          inline_data: {
            mime_type: resp.headers.get("content-type") || "image/png",
            data: btoa(s),
          },
        });
      } catch { /* skip unreachable ref image */ }
    }
    const r = await fetch(
      `${GEMINI_BASE}/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }] }),
      },
    );
    const t = await r.text();
    if (!r.ok) throw new ProviderError(classify(r.status, t), r.status, t.slice(0, 500));
    const j = JSON.parse(t);
    const cand = j?.candidates?.[0]?.content?.parts || [];
    for (const p of cand) {
      const data = p?.inline_data?.data || p?.inlineData?.data;
      if (data) return { image_b64: data, raw: j };
    }
    throw new ProviderError("server", 502, "Gemini: no image returned");
  },
};

// ============ OpenAI =============================================
const OPENAI_BASE = "https://api.openai.com/v1";

export const openai = {
  async validate(apiKey: string) {
    const r = await fetch(`${OPENAI_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const t = await r.text();
    if (!r.ok) throw new ProviderError(classify(r.status, t), r.status, t.slice(0, 300));
    // Try OpenAI billing endpoint (works for some legacy keys). Soft-fail otherwise.
    const balance: Record<string, unknown> = { amount: null, unit: null, currency: "USD", checked_at: new Date().toISOString() };
    try {
      const br = await fetch(`${OPENAI_BASE}/dashboard/billing/credit_grants`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (br.ok) {
        const bj = await br.json();
        const left = Number(bj?.total_available ?? bj?.total_granted - bj?.total_used);
        if (Number.isFinite(left)) { balance.amount = left; balance.unit = "USD"; }
      } else {
        balance.note = "OpenAI не отдаёт баланс по этому ключу (нужен sk-admin-…)";
      }
    } catch { balance.note = "Не удалось получить баланс"; }
    return { ok: true, balance };
  },
  async generateImage(apiKey: string, opts: GenInput): Promise<GenResult> {
    const size = aspectToOpenaiSize(opts.aspect);
    const r = await fetch(`${OPENAI_BASE}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: opts.prompt,
        size,
        n: 1,
      }),
    });
    const t = await r.text();
    if (!r.ok) throw new ProviderError(classify(r.status, t), r.status, t.slice(0, 500));
    const j = JSON.parse(t);
    const data = j?.data?.[0];
    if (data?.b64_json) return { image_b64: data.b64_json, raw: j };
    if (data?.url) return { image_url: data.url, raw: j };
    throw new ProviderError("server", 502, "OpenAI: empty response");
  },
};

function aspectToOpenaiSize(a?: string): string {
  if (!a) return "1024x1024";
  if (a === "1:1") return "1024x1024";
  if (a === "9:16" || a === "2:3" || a === "3:4" || a === "4:5") return "1024x1536";
  if (a === "16:9" || a === "3:2" || a === "4:3") return "1536x1024";
  return "1024x1024";
}

export const adapters: Record<ProviderId, typeof kie> = {
  kie_ai: kie,
  gemini,
  openai,
};