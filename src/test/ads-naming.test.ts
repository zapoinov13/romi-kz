import { describe, expect, it } from "vitest";
import {
  CTA_BY_GOAL,
  defaultCtaForGoal,
  isHttpsUrl,
  normalizeWhatsAppNumber,
  resolveWhatsAppPhoneFromAsset,
} from "@/lib/adsNaming";

describe("adsNaming — WhatsApp", () => {
  it("нормализует +7 и пробелы", () => {
    expect(normalizeWhatsAppNumber("+7 (700) 123-45-67")).toBe("77001234567");
  });

  it("не принимает короткий Meta ID как номер", () => {
    expect(normalizeWhatsAppNumber("123456789")).toHaveLength(9);
    expect(resolveWhatsAppPhoneFromAsset("123456789", "+7 700 123 45 67")).toBe(
      "77001234567",
    );
  });
});

describe("adsNaming — CTA по целям", () => {
  it("whatsapp → WHATSAPP_MESSAGE", () => {
    expect(defaultCtaForGoal("whatsapp")).toBe("WHATSAPP_MESSAGE");
  });

  it("site-leads → LEARN_MORE", () => {
    expect(defaultCtaForGoal("site-leads")).toBe("LEARN_MORE");
  });

  it("meta-form → SIGN_UP", () => {
    expect(defaultCtaForGoal("meta-form")).toBe("SIGN_UP");
  });

  it("traffic → LEARN_MORE", () => {
    expect(defaultCtaForGoal("traffic")).toBe("LEARN_MORE");
  });

  it("у каждой цели есть хотя бы один CTA", () => {
    for (const goal of ["whatsapp", "site-leads", "meta-form", "traffic"] as const) {
      expect(CTA_BY_GOAL[goal].length).toBeGreaterThan(0);
    }
  });
});

describe("adsNaming — URL", () => {
  it("принимает https", () => {
    expect(isHttpsUrl("https://example.com/landing")).toBe(true);
  });

  it("отклоняет http", () => {
    expect(isHttpsUrl("http://example.com")).toBe(false);
  });
});
