import { describe, expect, it } from "vitest";
import {
  isWithinBusinessHours,
  businessWindowForDate,
} from "../src/engine/businessHours.js";
import { createCalendar } from "../src/engine/store.js";
import type { BusinessHours } from "../src/types.js";

const TZ = "UTC";
const bh: BusinessHours = { startMinute: 9 * 60, endMinute: 17 * 60 }; // 09:00–17:00, Mon–Fri

describe("isWithinBusinessHours", () => {
  it("respects hours and weekdays", () => {
    const monday10 = Date.UTC(2026, 5, 22, 10); // Mon 2026-06-22
    const monday18 = Date.UTC(2026, 5, 22, 18);
    const saturday10 = Date.UTC(2026, 5, 27, 10); // Sat
    expect(isWithinBusinessHours(monday10, TZ, bh)).toBe(true);
    expect(isWithinBusinessHours(monday18, TZ, bh)).toBe(false);
    expect(isWithinBusinessHours(saturday10, TZ, bh)).toBe(false);
  });

  it("is always open with no windows configured", () => {
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 27, 3), TZ, undefined)).toBe(true);
  });

  it("supports multiple windows (e.g. split shift)", () => {
    const split: BusinessHours[] = [
      { startMinute: 9 * 60, endMinute: 12 * 60 },
      { startMinute: 14 * 60, endMinute: 18 * 60 },
    ];
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 13), TZ, split)).toBe(false); // lunch
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 15), TZ, split)).toBe(true);
  });
});

describe("businessWindowForDate", () => {
  it("returns the day's window, or null on a non-working day", () => {
    const win = businessWindowForDate({ year: 2026, month: 6, day: 22 }, TZ, bh);
    expect(win).toEqual({ start: Date.UTC(2026, 5, 22, 9), end: Date.UTC(2026, 5, 22, 17) });
    expect(businessWindowForDate({ year: 2026, month: 6, day: 27 }, TZ, bh)).toBeNull();
  });
});

describe("store slot/business config", () => {
  it("defaults slotMinutes to 15 and exposes setters", () => {
    const s = createCalendar({ timeZone: TZ });
    expect(s.getState().slotMinutes).toBe(15);
    s.setSlotMinutes(30);
    expect(s.getState().slotMinutes).toBe(30);
    s.setBusinessHours(bh);
    expect(s.getState().businessHours).toEqual(bh);
  });
});
