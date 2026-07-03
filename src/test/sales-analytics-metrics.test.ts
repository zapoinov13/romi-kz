import { describe, expect, it } from "vitest";
import {
  computeSalesKpi,
  computeTopCreatives,
  filterSalesLeads,
} from "@/lib/salesAnalyticsMetrics";
import { EMPTY_SALES_FILTERS, type SalesAnalyticsLead } from "@/types/salesAnalytics";

const lead = (patch: Partial<SalesAnalyticsLead>): SalesAnalyticsLead => ({
  id: "1",
  projectId: "p",
  leadId: null,
  name: "Test",
  phone: "+77001234567",
  sourceLabel: "ad_123",
  metaAdId: "123",
  utmContent: null,
  channel: "whatsapp",
  isQualified: null,
  paymentStatus: null,
  serviceId: null,
  amount: null,
  createdAt: "2026-07-15T10:00:00Z",
  ...patch,
});

describe("salesAnalyticsMetrics", () => {
  it("computes KPI with ROAS and avg check", () => {
    const rows = [
      lead({ id: "1", isQualified: true, paymentStatus: "paid", amount: 100_000 }),
      lead({ id: "2", isQualified: false, paymentStatus: "unpaid" }),
    ];
    const kpi = computeSalesKpi(rows, 50_000);
    expect(kpi.totalLeads).toBe(2);
    expect(kpi.cpl).toBe(25_000);
    expect(kpi.paidClients).toBe(1);
    expect(kpi.revenue).toBe(100_000);
    expect(kpi.cac).toBe(50_000);
    expect(kpi.qualifiedRate).toBe(50);
    expect(kpi.roas).toBe(200);
    expect(kpi.avgCheck).toBe(100_000);
  });

  it("filters by qualified and payment", () => {
    const rows = [
      lead({ id: "1", isQualified: true }),
      lead({ id: "2", isQualified: false }),
    ];
    const f = filterSalesLeads(rows, { ...EMPTY_SALES_FILTERS, qualified: "yes" });
    expect(f).toHaveLength(1);
  });

  it("groups top creatives by revenue", () => {
    const rows = [
      lead({ id: "1", metaAdId: "A", paymentStatus: "paid", amount: 200 }),
      lead({ id: "2", metaAdId: "B", paymentStatus: "paid", amount: 500 }),
      lead({ id: "3", metaAdId: "A" }),
    ];
    const top = computeTopCreatives(rows, 2);
    expect(top[0].key).toBe("B");
    expect(top[0].revenue).toBe(500);
  });
});
