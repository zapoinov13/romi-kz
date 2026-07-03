import { describe, expect, it } from "vitest";
import {
  metaConversionsTotal,
  metaCostPerMessage,
  metaCplAllConversions,
  metaCplForms,
  metaCpc,
} from "@/lib/metaAdsMetrics";

describe("metaAdsMetrics", () => {
  const sample = { spend: 1000, clicks: 200, leads: 5, messages: 15 };

  it("не смешивает клики с конверсиями", () => {
    expect(metaConversionsTotal(sample)).toBe(20);
    expect(metaCpc(sample)).toBe(5);
  });

  it("считает CPL форм и цену сообщения отдельно", () => {
    expect(metaCplForms(sample)).toBe(200);
    expect(metaCostPerMessage(sample)).toBeCloseTo(1000 / 15);
    expect(metaCplAllConversions(sample)).toBe(50);
  });

  it("игнорирует отрицательные значения", () => {
    expect(metaConversionsTotal({ leads: -1, messages: 3 })).toBe(3);
  });
});
