// AES-GCM encryption for content-factory provider keys.
// Key is derived from SUPABASE_SERVICE_ROLE_KEY (deterministic per project)
// to avoid asking the user for an extra secret.

const enc = new TextEncoder();
const dec = new TextDecoder();

async function getKey(): Promise<CryptoKey> {
  const seed = Deno.env.get("CONTENT_FACTORY_ENCRYPTION_KEY")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || "fallback-do-not-use";
  const hash = await crypto.subtle.digest("SHA-256", enc.encode("cf::v1::" + seed));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(str: string): Uint8Array {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptApiKey(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0); out.set(ct, iv.length);
  return "v1:" + b64encode(out);
}

export async function decryptApiKey(payload: string): Promise<string> {
  if (!payload?.startsWith("v1:")) throw new Error("bad ciphertext");
  const all = b64decode(payload.slice(3));
  const iv = all.slice(0, 12);
  const ct = all.slice(12);
  const key = await getKey();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return dec.decode(pt);
}

export function maskKey(plain: string): string {
  const t = (plain || "").trim();
  if (t.length <= 4) return "****";
  return "****" + t.slice(-4);
}