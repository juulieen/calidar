import { describe, expect, it } from "vitest";
import {
  isWithinBusinessHours,
  businessWindowForDate,
  businessWindowsForDate,
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

  it("treats start as inclusive and end as exclusive", () => {
    // bh = 09:00–17:00
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 9, 0), TZ, bh)).toBe(true); // exact start
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 8, 59), TZ, bh)).toBe(false);
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 17, 0), TZ, bh)).toBe(false); // exact end
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 16, 59), TZ, bh)).toBe(true);
  });

  it("handles overnight windows that wrap past midnight", () => {
    // Night shift 22:00–06:00 on every day.
    const night: BusinessHours = {
      startMinute: 22 * 60,
      endMinute: 6 * 60,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    };
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 23), TZ, night)).toBe(true); // late evening
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 2), TZ, night)).toBe(true); // small hours
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 22, 0), TZ, night)).toBe(true); // exact start
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 6, 0), TZ, night)).toBe(false); // exact end
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 12), TZ, night)).toBe(false); // midday
  });

  it("respects daysOfWeek overrides for overnight windows (by the instant's own weekday)", () => {
    // Monday-only night shift.
    const mondayNight: BusinessHours = {
      startMinute: 22 * 60,
      endMinute: 6 * 60,
      daysOfWeek: [1],
    };
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 23), TZ, mondayNight)).toBe(true); // Mon 23:00
    // Tue 02:00 is not Monday → out, since weekday is that of the instant.
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 23, 2), TZ, mondayNight)).toBe(false);
  });

  it("treats an empty window (start === end) as out-of-hours", () => {
    const empty: BusinessHours = { startMinute: 9 * 60, endMinute: 9 * 60 };
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 9), TZ, empty)).toBe(false);
  });

  it("clamps out-of-range minutes without throwing", () => {
    const odd: BusinessHours = { startMinute: -100, endMinute: 9000 };
    // Clamped to 0..1440 → covers the whole day.
    expect(isWithinBusinessHours(Date.UTC(2026, 5, 22, 12), TZ, odd)).toBe(true);
  });
});

describe("businessWindowForDate", () => {
  it("returns the day's window, or null on a non-working day", () => {
    const win = businessWindowForDate({ year: 2026, month: 6, day: 22 }, TZ, bh);
    expect(win).toEqual({ start: Date.UTC(2026, 5, 22, 9), end: Date.UTC(2026, 5, 22, 17) });
    expect(businessWindowForDate({ year: 2026, month: 6, day: 27 }, TZ, bh)).toBeNull();
  });
});

describe("businessWindowsForDate", () => {
  it("returns every matching window for a split shift", () => {
    const split: BusinessHours[] = [
      { startMinute: 9 * 60, endMinute: 12 * 60 },
      { startMinute: 14 * 60, endMinute: 18 * 60 },
    ];
    const wins = businessWindowsForDate({ year: 2026, month: 6, day: 22 }, TZ, split);
    expect(wins).toEqual([
      { start: Date.UTC(2026, 5, 22, 9), end: Date.UTC(2026, 5, 22, 12) },
      { start: Date.UTC(2026, 5, 22, 14), end: Date.UTC(2026, 5, 22, 18) },
    ]);
  });

  it("returns an empty array on a non-working day", () => {
    expect(businessWindowsForDate({ year: 2026, month: 6, day: 27 }, TZ, bh)).toEqual([]);
  });

  it("ends an overnight window on the following day", () => {
    const night: BusinessHours = {
      startMinute: 22 * 60,
      endMinute: 6 * 60,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    };
    const wins = businessWindowsForDate({ year: 2026, month: 6, day: 22 }, TZ, night);
    expect(wins).toEqual([
      { start: Date.UTC(2026, 5, 22, 22), end: Date.UTC(2026, 5, 23, 6) },
    ]);
  });

  it("crosses a month boundary correctly for overnight windows", () => {
    const night: BusinessHours = {
      startMinute: 22 * 60,
      endMinute: 6 * 60,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    };
    // 2026-06-30 → next day is 2026-07-01.
    const wins = businessWindowsForDate({ year: 2026, month: 6, day: 30 }, TZ, night);
    expect(wins).toEqual([
      { start: Date.UTC(2026, 5, 30, 22), end: Date.UTC(2026, 6, 1, 6) },
    ]);
  });

  it("skips empty windows (start === end)", () => {
    const empty: BusinessHours = { startMinute: 9 * 60, endMinute: 9 * 60 };
    expect(businessWindowsForDate({ year: 2026, month: 6, day: 22 }, TZ, empty)).toEqual([]);
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
