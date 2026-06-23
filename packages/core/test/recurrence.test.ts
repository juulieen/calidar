import { describe, expect, it } from "vitest";
import { expandRecurrence, parseRRule } from "../src/recurrence/rrule.js";
import { epochToWall } from "../src/datetime/zoned.js";

const TZ = "Europe/Paris";
const dtstart = { year: 2026, month: 6, day: 1, hour: 9, minute: 0, second: 0, millisecond: 0 }; // Mon 1 Jun
const HOUR = 3_600_000;

function localDays(starts: number[]) {
  return starts.map((s) => {
    const w = epochToWall(s, TZ);
    return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")} ${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
  });
}

describe("weekly recurrence", () => {
  it("expands BYDAY=MO,WE with COUNT", () => {
    const rule = parseRRule("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4", TZ);
    const occ = expandRecurrence({
      dtstart,
      durationMs: HOUR,
      timeZone: TZ,
      rule,
      window: { start: Date.UTC(2026, 5, 1), end: Date.UTC(2026, 6, 1) },
    });
    expect(localDays(occ.map((o) => o.start))).toEqual([
      "2026-06-01 09:00", // Mon
      "2026-06-03 09:00", // Wed
      "2026-06-08 09:00", // Mon
      "2026-06-10 09:00", // Wed
    ]);
  });

  it("respects the visible window", () => {
    const rule = parseRRule("FREQ=DAILY", TZ);
    const occ = expandRecurrence({
      dtstart,
      durationMs: HOUR,
      timeZone: TZ,
      rule,
      window: { start: Date.UTC(2026, 5, 10), end: Date.UTC(2026, 5, 13) },
    });
    expect(localDays(occ.map((o) => o.start))).toEqual([
      "2026-06-10 09:00",
      "2026-06-11 09:00",
      "2026-06-12 09:00",
    ]);
  });
});

describe("monthly recurrence", () => {
  it("expands the 3rd Monday of each month", () => {
    const rule = parseRRule("FREQ=MONTHLY;BYDAY=3MO", TZ);
    const occ = expandRecurrence({
      dtstart,
      durationMs: HOUR,
      timeZone: TZ,
      rule,
      window: { start: Date.UTC(2026, 5, 1), end: Date.UTC(2026, 8, 1) },
    });
    expect(localDays(occ.map((o) => o.start))).toEqual([
      "2026-06-15 09:00",
      "2026-07-20 09:00",
      "2026-08-17 09:00",
    ]);
  });

  it("supports last weekday (-1FR)", () => {
    const rule = parseRRule("FREQ=MONTHLY;BYDAY=-1FR", TZ);
    const occ = expandRecurrence({
      dtstart,
      durationMs: HOUR,
      timeZone: TZ,
      rule,
      window: { start: Date.UTC(2026, 5, 1), end: Date.UTC(2026, 7, 1) },
    });
    expect(localDays(occ.map((o) => o.start))).toEqual([
      "2026-06-26 09:00",
      "2026-07-31 09:00",
    ]);
  });
});

describe("until + exdate", () => {
  it("stops at UNTIL and skips EXDATE", () => {
    const rule = parseRRule("FREQ=DAILY;UNTIL=20260604T235959", TZ);
    const ex = new Set<number>();
    // exclude 2026-06-02 09:00 Paris
    const occAll = expandRecurrence({
      dtstart,
      durationMs: HOUR,
      timeZone: TZ,
      rule,
      window: { start: Date.UTC(2026, 5, 1), end: Date.UTC(2026, 5, 10) },
    });
    ex.add(occAll[1]!.start);
    const occ = expandRecurrence({
      dtstart,
      durationMs: HOUR,
      timeZone: TZ,
      rule,
      exdates: ex,
      window: { start: Date.UTC(2026, 5, 1), end: Date.UTC(2026, 5, 10) },
    });
    expect(localDays(occ.map((o) => o.start))).toEqual([
      "2026-06-01 09:00",
      "2026-06-03 09:00",
      "2026-06-04 09:00",
    ]);
  });
});
