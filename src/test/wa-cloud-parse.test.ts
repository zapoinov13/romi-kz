import { describe, expect, it } from "vitest";
import {
  extractCloudMessageText,
  normalizeWaPhone,
  shouldCreateLeadForDirection,
} from "@/lib/waCloudParse";

describe("waCloudParse", () => {
  it("нормализует личный wa_id и отклоняет группы", () => {
    expect(normalizeWaPhone("77001234567")).toBe("77001234567");
    expect(normalizeWaPhone("77001234567@c.us")).toBe("77001234567");
    expect(normalizeWaPhone("12036302@g.us")).toBeNull();
    expect(normalizeWaPhone("status@broadcast")).toBeNull();
  });

  it("достаёт текст из Cloud API payload", () => {
    expect(extractCloudMessageText({ type: "text", text: { body: "Привет" } })).toBe("Привет");
    expect(extractCloudMessageText({ type: "image" })).toBe("[Фото]");
  });

  it("echo из приложения не создаёт лида", () => {
    expect(shouldCreateLeadForDirection("out", "smb_message_echoes")).toBe(false);
    expect(shouldCreateLeadForDirection("in", "messages")).toBe(true);
    expect(shouldCreateLeadForDirection("out", "messages")).toBe(false);
  });
});
