import { describe, expect, it } from "vitest";
import {
  eachDayInRange,
  lastWeekRange,
  matchPeriodPreset,
  rangesEqual,
  thisWeekRange,
  todayRange,
  yesterdayRange,
} from "@/lib/periodRange";

describe("periodRange", () => {
  it("matches today and yesterday presets", () => {
    expect(matchPeriodPreset(todayRange())).toBe("today");
    expect(matchPeriodPreset(yesterdayRange())).toBe("yesterday");
  });

  it("this week starts on Monday and ends today", () => {
    const r = thisWeekRange();
    expect(r.from.getDay()).toBe(1);
    expect(r.to.getDate()).toBe(new Date().getDate());
    expect(matchPeriodPreset(r)).toBe("thisWeek");
  });

  it("last week is 7 days ending Sunday", () => {
    const r = lastWeekRange();
    expect(r.to.getDay()).toBe(0);
    expect(rangesEqual(r, r)).toBe(true);
    expect(matchPeriodPreset(r)).toBe("lastWeek");
  });

  it("eachDayInRange returns inclusive day list", () => {
    const r = yesterdayRange();
    expect(eachDayInRange(r)).toHaveLength(1);
    expect(eachDayInRange(thisWeekRange()).length).toBeGreaterThanOrEqual(1);
  });
});
