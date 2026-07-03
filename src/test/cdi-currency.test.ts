import { describe, expect, it } from "vitest";
import { metaMoneyToUsd, normalizeCdiMetaMoney } from "@/lib/cdiCurrency";

describe("cdiCurrency", () => {
  const rates = new Map([["2026-07-01", 500]]);

  it("keeps USD amounts unchanged", () => {
    expect(metaMoneyToUsd(42, "USD", "2026-07-01", rates)).toBe(42);
  });

  it("converts legacy KZT spend to USD", () => {
    expect(metaMoneyToUsd(24_690, "KZT", "2026-07-01", rates)).toBeCloseTo(49.38, 1);
  });

  it("normalizes CDI row meta money", () => {
    const row = normalizeCdiMetaMoney(
      { date: "2026-07-01", spend: 1000, revenue: 500, currency: "KZT" },
      rates,
    );
    expect(row.currency).toBe("USD");
    expect(row.spend).toBe(2);
    expect(row.revenue).toBe(1);
  });
});
