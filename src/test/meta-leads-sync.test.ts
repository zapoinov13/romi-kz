import { describe, expect, it } from "vitest";

/** Mirror of field parser in meta-leads-sync (keep in sync). */
function parseLeadFields(fields: Array<{ name?: string; values?: string[] }> | undefined) {
  const map = new Map<string, string>();
  for (const f of fields ?? []) {
    const key = (f.name ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    const val = (f.values ?? []).map((v) => String(v).trim()).filter(Boolean).join(", ");
    if (key && val) map.set(key, val);
  }
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = map.get(k);
      if (v) return v;
    }
    for (const [k, v] of map) {
      if (keys.some((key) => k.includes(key))) return v;
    }
    return null;
  };
  const first = pick("first_name", "firstname");
  const last = pick("last_name", "lastname");
  const full = pick("full_name", "fullname", "name");
  const name = full || [first, last].filter(Boolean).join(" ").trim() || null;
  const phone = pick("phone_number", "phone", "tel", "mobile", "телефон");
  return { name, phone };
}

describe("meta lead form field parser", () => {
  it("parses standard Meta lead form fields", () => {
    const parsed = parseLeadFields([
      { name: "full_name", values: ["Айгуль"] },
      { name: "phone_number", values: ["+77001234567"] },
    ]);
    expect(parsed.name).toBe("Айгуль");
    expect(parsed.phone).toBe("+77001234567");
  });
});
