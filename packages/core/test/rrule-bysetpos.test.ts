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

describe("BYSETPOS — DTSTART mid-period (RFC 5545: bound candidates before selection)", () => {
  // DTSTART here is NOT Mon 1 Jun; the candidate set of the first period must be
  // bounded by DTSTART before BYSETPOS picks a position.
  function expandFrom(
    dt: typeof dtstart,
    rrule: string,
    window: { start: number; end: number },
  ) {
    return expandRecurrence({
      dtstart: dt,
      durationMs: HOUR,
      timeZone: TZ,
      rule: parseRRule(rrule, TZ),
      window,
    });
  }

  it("weekly: first of MO/WE/FR with DTSTART=Wed 3 Jun keeps Wed 3 (BYSETPOS=1)", () => {
    // Week of 3 Jun candidates Mon 1/Wed 3/Fri 5; bounded by DTSTART → Wed 3/Fri 5;
    // pos 1 = Wed 3 (not Mon 1, which precedes DTSTART). Later weeks start Monday.
    const dt = { ...dtstart, day: 3 }; // Wed 3 Jun
    const occ = expandFrom(dt, "FREQ=WEEKLY;BYDAY=MO,WE,FR;BYSETPOS=1", {
      start: Date.UTC(2026, 5, 1),
      end: Date.UTC(2026, 6, 1),
    });
    expect(days(occ.map((o) => o.start))).toEqual([
      "2026-06-03", // Wed (would be lost if BYSETPOS ran before bounding)
      "2026-06-08", // Mon
      "2026-06-15", // Mon
      "2026-06-22", // Mon
      "2026-06-29", // Mon
    ]);
  });

  it("monthly: first Sunday with DTSTART=Mon 15 Jun is bounded to 21 Jun (BYSETPOS=1)", () => {
    // June Sundays 7,14,21,28; bounded by day 15 → 21,28; pos 1 = 21 Jun.
    const dt = { ...dtstart, day: 15 }; // Mon 15 Jun
    const occ = expandFrom(dt, "FREQ=MONTHLY;BYDAY=SU;BYSETPOS=1", {
      start: Date.UTC(2026, 5, 1),
      end: Date.UTC(2026, 8, 1),
    });
    expect(days(occ.map((o) => o.start))).toEqual([
      "2026-06-21", // 1st Sunday on/after DTSTART
      "2026-07-05",
      "2026-08-02",
    ]);
  });

  it("monthly: mixed first+last Sunday with DTSTART=15 Jun (BYSETPOS=1,-1)", () => {
    // June bounded Sundays 21,28 → first=21, last=28; later months full set.
    const dt = { ...dtstart, day: 15 }; // Mon 15 Jun
    const occ = expandFrom(dt, "FREQ=MONTHLY;BYDAY=SU;BYSETPOS=1,-1", {
      start: Date.UTC(2026, 5, 1),
      end: Date.UTC(2026, 8, 1),
    });
    expect(days(occ.map((o) => o.start))).toEqual([
      "2026-06-21", // first bounded Sunday
      "2026-06-28", // last Sunday
      "2026-07-05", // first Sunday
      "2026-07-26", // last Sunday
      "2026-08-02", // first Sunday
      "2026-08-30", // last Sunday
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
