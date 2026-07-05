import { describe, expect, it } from "vitest";
import {
  extractMetaAdIdFromLead,
  extractAdNameFromUtm,
  resolveLeadAdName,
} from "@/lib/salesAdName";

describe("salesAdName", () => {
  it("находит ad id в utm.content (lead-intake) и utm.utm_content", () => {
    expect(
      extractMetaAdIdFromLead(null, { content: "120212345678901234" }, "+77001234567"),
    ).toBe("120212345678901234");
    expect(
      extractMetaAdIdFromLead(null, { utm_content: "120212345678901234" }, "+77001234567"),
    ).toBe("120212345678901234");
  });

  it("резолвит название из utm ad_name для лид-формы", () => {
    expect(extractAdNameFromUtm({ ad_name: "Имплант · форма Meta" })).toBe("Имплант · форма Meta");
    expect(
      resolveLeadAdName("120212345678901234", { ad_name: "Имплант · форма Meta" }, {
        creatives: new Map(),
        campaigns: new Map(),
      }),
    ).toBe("Имплант · форма Meta");
  });

  it("резолвит название из meta_creatives по ad id", () => {
    const creatives = new Map<string, string>([["120212345678901234", "Креатив форма A"]]);
    expect(
      resolveLeadAdName("120212345678901234", null, { creatives, campaigns: new Map() }),
    ).toBe("Креатив форма A");
  });
});
