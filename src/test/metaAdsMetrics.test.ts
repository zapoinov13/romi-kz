import { describe, expect, it } from "vitest";
import {
  campaignResultKind,
  metaConversionsTotal,
  metaCostPerMessage,
  metaCplAllConversions,
  metaCplForms,
  metaCpc,
  reclassifyStoredMetrics,
  splitLeadsAndMessages,
} from "@/lib/metaAdsMetrics";

describe("metaAdsMetrics", () => {
  const sample = { spend: 1000, clicks: 200, leads: 5, messages: 15 };

  it("не смешивает клики с конверсиями", () => {
    expect(metaConversionsTotal(sample)).toBe(20);
    expect(metaCpc(sample)).toBe(5);
  });

  it("считает CPL сайта и цену WhatsApp отдельно", () => {
    expect(metaCplForms(sample)).toBe(200);
    expect(metaCostPerMessage(sample)).toBeCloseTo(1000 / 15);
    expect(metaCplAllConversions(sample)).toBe(50);
  });

  it("игнорирует отрицательные значения", () => {
    expect(metaConversionsTotal({ leads: -1, messages: 3 })).toBe(3);
  });
});

describe("campaignResultKind", () => {
  it("WHATSAPP destination → whatsapp", () => {
    expect(campaignResultKind("WHATSAPP")).toBe("whatsapp");
    expect(campaignResultKind("MESSAGING_INSTAGRAM_DIRECT_WHATSAPP")).toBe("whatsapp");
  });

  it("OUTCOME_LEADS → site_leads (пиксель)", () => {
    expect(campaignResultKind("WEBSITE", "OUTCOME_LEADS")).toBe("site_leads");
    expect(campaignResultKind(null, "OUTCOME_LEADS")).toBe("site_leads");
  });

  it("OUTCOME_ENGAGEMENT + WA → whatsapp (начатая переписка)", () => {
    expect(campaignResultKind("WHATSAPP", "OUTCOME_ENGAGEMENT")).toBe("whatsapp");
  });

  it("OUTCOME_ENGAGEMENT без WA → not whatsapp", () => {
    expect(campaignResultKind(null, "OUTCOME_ENGAGEMENT")).toBe("other");
  });

  it("WEBSITE / формы → site_leads", () => {
    expect(campaignResultKind("WEBSITE")).toBe("site_leads");
    expect(campaignResultKind("ON_AD")).toBe("site_leads");
  });

  it("TRAFFIC objective → traffic", () => {
    expect(campaignResultKind(null, "OUTCOME_TRAFFIC")).toBe("traffic");
  });

  it("имя кампании как фоллбэк", () => {
    expect(campaignResultKind(null, null, null, "WA стоматология")).toBe("whatsapp");
    expect(campaignResultKind(null, null, null, "Лиды сайт лендинг")).toBe("site_leads");
    expect(campaignResultKind(null, null, null, "Трафик клики")).toBe("traffic");
  });
});

describe("splitLeadsAndMessages по destination", () => {
  const waActions = [
    { action_type: "lead", value: "12" },
    { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "12" },
  ];
  const siteActions = [
    { action_type: "offsite_conversion.fb_pixel_lead", value: "7" },
    { action_type: "lead", value: "7" },
  ];

  it("WhatsApp → только начатая переписка, leads = 0", () => {
    expect(splitLeadsAndMessages(waActions, "WHATSAPP", "OUTCOME_ENGAGEMENT")).toEqual({
      leads: 0,
      messages: 12,
    });
  });

  it("OUTCOME_LEADS + pixel → лиды сайта, не WA", () => {
    expect(
      splitLeadsAndMessages(
        [
          { action_type: "offsite_conversion.fb_pixel_lead", value: "13" },
          { action_type: "lead", value: "15" },
        ],
        "WEBSITE",
        "OUTCOME_LEADS",
      ),
    ).toEqual({ leads: 13, messages: 0 });
  });

  it("сайт → только leads, messages = 0", () => {
    expect(splitLeadsAndMessages(siteActions, "WEBSITE")).toEqual({ leads: 7, messages: 0 });
  });

  it("pixel lead без destination → лиды сайта (как в Ads Manager)", () => {
    expect(
      splitLeadsAndMessages(
        [
          { action_type: "offsite_conversion.fb_pixel_lead", value: "13" },
          { action_type: "lead", value: "15" },
        ],
        null,
      ),
    ).toEqual({ leads: 13, messages: 0 });
  });

  it("трафик → ни лиды, ни сообщения", () => {
    expect(
      splitLeadsAndMessages([{ action_type: "lead", value: "5" }], null, "OUTCOME_TRAFFIC"),
    ).toEqual({ leads: 0, messages: 0 });
  });

  it("голый lead без destination → leads (не WhatsApp)", () => {
    expect(splitLeadsAndMessages([{ action_type: "lead", value: "46" }], null)).toEqual({
      leads: 46,
      messages: 0,
    });
  });

  it("pixel lead без destination → лиды сайта", () => {
    expect(
      splitLeadsAndMessages(
        [{ action_type: "offsite_conversion.fb_pixel_lead", value: "7" }],
        null,
      ),
    ).toEqual({ leads: 7, messages: 0 });
  });
});

describe("reclassifyStoredMetrics", () => {
  it("чинит старые данные WA", () => {
    expect(reclassifyStoredMetrics(12, 12, "WHATSAPP")).toEqual({ leads: 0, messages: 12 });
    // messages = начатая переписка; если была только в leads — берём leads
    expect(reclassifyStoredMetrics(20, 10, "WHATSAPP")).toEqual({ leads: 0, messages: 10 });
    expect(reclassifyStoredMetrics(20, 0, "WHATSAPP")).toEqual({ leads: 0, messages: 20 });
  });

  it("сайт оставляет leads", () => {
    expect(reclassifyStoredMetrics(7, 0, "WEBSITE")).toEqual({ leads: 7, messages: 0 });
  });

  it("сайт: чинит старые данные в колонке messages", () => {
    expect(reclassifyStoredMetrics(0, 13, "WEBSITE")).toEqual({ leads: 13, messages: 0 });
    expect(reclassifyStoredMetrics(0, 13, null, "OUTCOME_LEADS")).toEqual({ leads: 13, messages: 0 });
  });

  it("CDI без метаданных: leads остаются leads", () => {
    expect(reclassifyStoredMetrics(46, 0, null)).toEqual({ leads: 46, messages: 0 });
  });
});
