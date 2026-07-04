import { describe, expect, it } from "vitest";
import {
  appendMetaGapRows,
  computeSalesKpi,
  computeTopCreatives,
  filterByCabinet,
  filterDisplayableSalesLeads,
  filterSalesLeads,
  hasLeadContact,
} from "@/lib/salesAnalyticsMetrics";
import { EMPTY_SALES_FILTERS, type SalesAnalyticsLead } from "@/types/salesAnalytics";

const lead = (patch: Partial<SalesAnalyticsLead>): SalesAnalyticsLead => ({
  id: "1",
  projectId: "p",
  leadId: "lead-1",
  cabinetId: "cab-1",
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
  it("считает KPI: CPL по Meta, квал по CRM", () => {
    const rows = [
      lead({ id: "1", leadId: "1", isQualified: true, paymentStatus: "paid", amount: 100_000 }),
      lead({ id: "2", leadId: "2", isQualified: false, paymentStatus: "unpaid" }),
    ];
    const kpi = computeSalesKpi(rows, 50_000, { formLeads: 1, messages: 1, conversions: 2 });
    expect(kpi.crmLeads).toBe(2);
    expect(kpi.metaLeads).toBe(2);
    expect(kpi.cpl).toBe(25_000);
    expect(kpi.paidClients).toBe(1);
    expect(kpi.revenue).toBe(100_000);
    expect(kpi.cac).toBe(50_000);
    expect(kpi.qualifiedRate).toBe(50);
    expect(kpi.roas).toBe(200);
    expect(kpi.avgCheck).toBe(100_000);
  });

  it("квал % только от CRM, даже если Meta больше", () => {
    const rows = [lead({ id: "1", leadId: "1", isQualified: true })];
    const kpi = computeSalesKpi(rows, 100_000, 15);
    expect(kpi.metaLeads).toBe(15);
    expect(kpi.crmLeads).toBe(1);
    expect(kpi.cpl).toBeCloseTo(100_000 / 15);
    expect(kpi.qualifiedRate).toBe(100);
  });

  it("filters by qualified and payment", () => {
    const rows = [
      lead({ id: "1", leadId: "1", isQualified: true }),
      lead({ id: "2", leadId: "2", isQualified: false }),
    ];
    const f = filterSalesLeads(rows, { ...EMPTY_SALES_FILTERS, qualified: "yes" });
    expect(f).toHaveLength(1);
  });

  it("кабинет строго по cabinet_id", () => {
    const rows = [
      lead({ id: "1", leadId: "1", cabinetId: "cab-1" }),
      lead({ id: "2", leadId: "2", cabinetId: null }),
      lead({ id: "3", leadId: "3", cabinetId: "cab-2" }),
    ];
    expect(filterByCabinet(rows, "cab-1")).toHaveLength(1);
  });

  it("appends meta gap rows (legacy helper)", () => {
    const rows = [lead({ id: "1", leadId: "1" })];
    const out = appendMetaGapRows(rows, 5, "cab", "2026-07");
    expect(out).toHaveLength(5);
    expect(out.filter((r) => r.isSynthetic)).toHaveLength(4);
  });

  it("hides synthetic and incomplete leads from table", () => {
    const rows = [
      lead({ id: "1", leadId: "1", name: "Айгуль", phone: "+77001234567" }),
      lead({ id: "2", leadId: "2", name: "Лид Meta (1)", phone: "—", isSynthetic: true }),
      lead({ id: "3", leadId: "3", name: "—", phone: "+77009998877" }),
    ];
    expect(hasLeadContact(rows[0])).toBe(true);
    expect(hasLeadContact(rows[1])).toBe(false);
    expect(hasLeadContact(rows[2])).toBe(false);
    expect(filterDisplayableSalesLeads(rows)).toHaveLength(1);
  });

  it("топ креативов по выручке", () => {
    const rows = [
      lead({ id: "1", leadId: "1", metaAdId: "a", sourceLabel: "A", paymentStatus: "paid", amount: 200 }),
      lead({ id: "2", leadId: "2", metaAdId: "a", sourceLabel: "A", paymentStatus: "paid", amount: 100 }),
      lead({ id: "3", leadId: "3", metaAdId: "b", sourceLabel: "B", paymentStatus: "unpaid" }),
    ];
    const top = computeTopCreatives(rows, 2);
    expect(top[0].key).toBe("a");
    expect(top[0].revenue).toBe(300);
    expect(top[0].sales).toBe(2);
  });
});
