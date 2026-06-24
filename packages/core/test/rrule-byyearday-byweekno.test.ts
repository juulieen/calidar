import { describe, expect, it } from "vitest";
import { expandRecurrence, parseRRule, serializeRRule } from "../src/recurrence/rrule.js";
import { epochToWall } from "../src/datetime/zoned.js";

const TZ = "UTC";
const HOUR = 3_600_000;

function dt(year: number) {
  return { year, month: 1, day: 1, hour: 9, minute: 0, second: 0, millisecond: 0 };
}
function dayList(starts: number[]): string[] {
  return starts.map((s) => {
    const w = epochToWall(s, TZ);
    return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
  });
}
function expand(rrule: string, year: number, window: { start: number; end: number }) {
  return dayList(
    expandRecurrence({
      dtstart: dt(year),
      durationMs: HOUR,
      timeZone: TZ,
      rule: parseRRule(rrule, TZ),
      window,
    }).map((o) => o.start),
  );
}

describe("BYYEARDAY", () => {
  it("day 1 of the year, yearly", () => {
    const out = expand("FREQ=YEARLY;BYYEARDAY=1", 2026, {
      start: Date.UTC(2026, 0, 1),
      end: Date.UTC(2028, 0, 1),
    });
    expect(out).toEqual(["2026-01-01", "2027-01-01"]);
  });

  it("last day of the year (BYYEARDAY=-1)", () => {
    const out = expand("FREQ=YEARLY;BYYEARDAY=-1", 2026, {
      start: Date.UTC(2026, 0, 1),
      end: Date.UTC(2027, 0, 1),
    });
    expect(out).toEqual(["2026-12-31"]);
  });

  it("100th day of a non-leap year", () => {
    const out = expand("FREQ=YEARLY;BYYEARDAY=100", 2026, {
      start: Date.UTC(2026, 0, 1),
      end: Date.UTC(2027, 0, 1),
    });
    expect(out).toEqual(["2026-04-10"]);
  });

  it("60th day of a leap year is Feb 29", () => {
    const out = expand("FREQ=YEARLY;BYYEARDAY=60", 2028, {
      start: Date.UTC(2028, 0, 1),
      end: Date.UTC(2029, 0, 1),
    });
    expect(out).toEqual(["2028-02-29"]);
  });
});

describe("BYWEEKNO", () => {
  it("Monday of ISO week 20, 2026", () => {
    const out = expand("FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO", 2026, {
      start: Date.UTC(2026, 0, 1),
      end: Date.UTC(2027, 0, 1),
    });
    expect(out).toEqual(["2026-05-11"]);
  });

  it("Monday of the last ISO week (BYWEEKNO=-1); 2026 has 53 weeks", () => {
    const out = expand("FREQ=YEARLY;BYWEEKNO=-1;BYDAY=MO", 2026, {
      start: Date.UTC(2026, 0, 1),
      end: Date.UTC(2027, 1, 1),
    });
    expect(out).toEqual(["2026-12-28"]);
  });
});

describe("serialization round-trip", () => {
  it("preserves BYYEARDAY and BYWEEKNO", () => {
    const a = parseRRule("FREQ=YEARLY;BYYEARDAY=-1", TZ);
    expect(a.byyearday).toEqual([-1]);
    expect(serializeRRule(a)).toContain("BYYEARDAY=-1");

    const b = parseRRule("FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO", TZ);
    expect(b.byweekno).toEqual([20]);
    const s = serializeRRule(b);
    expect(s).toContain("BYWEEKNO=20");
    expect(serializeRRule(parseRRule(s, TZ))).toBe(s);
  });
});
