import { describe, expect, it } from "vitest";
import { expandRecurrence, parseRRule, serializeRRule } from "../src/recurrence/rrule.js";
import { epochToWall } from "../src/datetime/zoned.js";

const TZ = "Europe/Paris";
const HOUR = 3_600_000;
const dtstart = { year: 2026, month: 6, day: 1, hour: 9, minute: 0, second: 0, millisecond: 0 }; // Mon 1 Jun

function days(starts: number[]): string[] {
  return starts.map((s) => {
    const w = epochToWall(s, TZ);
    return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
  });
}
function expand(rrule: string, window: { start: number; end: number }) {
  return expandRecurrence({
    dtstart,
    durationMs: HOUR,
    timeZone: TZ,
    rule: parseRRule(rrule, TZ),
    window,
  });
}

describe("BYSETPOS — monthly", () => {
  const win = { start: Date.UTC(2026, 5, 1), end: Date.UTC(2026, 8, 1) }; // Jun–Aug

  it("last weekday of the month (BYDAY=MO..FR;BYSETPOS=-1)", () => {
    const occ = expand("FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1", win);
    expect(days(occ.map((o) => o.start))).toEqual([
      "2026-06-30", // Tue
      "2026-07-31", // Fri
      "2026-08-31", // Mon
    ]);
  });

  it("first weekday of the month (BYSETPOS=1)", () => {
    const occ = expand("FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1", win);
    expect(days(occ.map((o) => o.start))).toEqual([
      "2026-06-01", // Mon
      "2026-07-01", // Wed
      "2026-08-03", // Mon (1st/2nd are weekend)
    ]);
  });

  it("2nd Sunday of the month (BYDAY=SU;BYSETPOS=2)", () => {
    const occ = expand("FREQ=MONTHLY;BYDAY=SU;BYSETPOS=2", win);
    expect(days(occ.map((o) => o.start))).toEqual([
      "2026-06-14",
      "2026-07-12",
      "2026-08-09",
    ]);
  });
});

describe("BYSETPOS — weekly", () => {
  it("last of MO/WE/FR each week = Friday (BYSETPOS=-1)", () => {
    const occ = expand("FREQ=WEEKLY;BYDAY=MO,WE,FR;BYSETPOS=-1", {
      start: Date.UTC(2026, 5, 1),
      end: Date.UTC(2026, 6, 1),
    });
    expect(days(occ.map((o) => o.start))).toEqual([
      "2026-06-05",
      "2026-06-12",
      "2026-06-19",
      "2026-06-26",
    ]);
  });
});

describe("BYSETPOS — serialization round-trip", () => {
  it("preserves BYSETPOS", () => {
    const rule = parseRRule("FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1", TZ);
    expect(rule.bysetpos).toEqual([-1]);
    const out = serializeRRule(rule);
    expect(out).toContain("BYSETPOS=-1");
    expect(serializeRRule(parseRRule(out, TZ))).toBe(out);
  });
});
