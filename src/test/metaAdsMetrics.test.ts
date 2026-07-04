import { describe, expect, it } from "vitest";
import {
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

describe("splitLeadsAndMessages по destination", () => {
  const waActions = [
    { action_type: "lead", value: "12" },
    { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "12" },
  ];
  const siteActions = [
    { action_type: "offsite_conversion.fb_pixel_lead", value: "7" },
    { action_type: "lead", value: "7" },
  ];

  it("WhatsApp → только messages, leads = 0", () => {
    expect(splitLeadsAndMessages(waActions, "WHATSAPP")).toEqual({ leads: 0, messages: 12 });
    expect(splitLeadsAndMessages(waActions, "MESSAGING_MESSENGER_WHATSAPP")).toEqual({
      leads: 0,
      messages: 12,
    });
  });

  it("сайт → только leads, messages = 0", () => {
    expect(splitLeadsAndMessages(siteActions, "WEBSITE")).toEqual({ leads: 7, messages: 0 });
  });

  it("если Meta отдала lead без messaging action на WA — всё равно в messages", () => {
    expect(splitLeadsAndMessages([{ action_type: "lead", value: "9" }], "WHATSAPP")).toEqual({
      leads: 0,
      messages: 9,
    });
  });

  it("reclassifyStoredMetrics чинит старые данные WA", () => {
    expect(reclassifyStoredMetrics(12, 12, "WHATSAPP")).toEqual({ leads: 0, messages: 12 });
    expect(reclassifyStoredMetrics(20, 10, "WHATSAPP")).toEqual({ leads: 0, messages: 20 });
    expect(reclassifyStoredMetrics(7, 0, "WEBSITE")).toEqual({ leads: 7, messages: 0 });
  });
});
