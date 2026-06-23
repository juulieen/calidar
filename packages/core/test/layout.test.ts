import { describe, expect, it } from "vitest";
import { layoutTimedColumns } from "../src/layout/overlap.js";
import { layoutDayBands, laneCount } from "../src/layout/month.js";
import type { EventInstance } from "../src/types.js";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const base = Date.UTC(2026, 5, 22, 0, 0, 0); // a midnight

function inst(id: string, startH: number, endH: number): EventInstance {
  return {
    key: id,
    eventId: id,
    title: id,
    start: base + startH * HOUR,
    end: base + endH * HOUR,
    allDay: false,
    recurring: false,
    editable: true,
    source: {} as never,
  };
}

describe("timed column layout", () => {
  it("gives a lone event the full width", () => {
    const out = layoutTimedColumns([inst("a", 9, 10)], base, base + DAY);
    expect(out).toHaveLength(1);
    expect(out[0]!.width).toBe(1);
    expect(out[0]!.columns).toBe(1);
  });

  it("splits two overlapping events into halves", () => {
    const out = layoutTimedColumns([inst("a", 9, 11), inst("b", 10, 12)], base, base + DAY);
    expect(out).toHaveLength(2);
    for (const l of out) {
      expect(l.columns).toBe(2);
      expect(l.width).toBeCloseTo(0.5);
    }
    expect(out.map((l) => l.column).sort()).toEqual([0, 1]);
  });

  it("positions an event by fractional top/height", () => {
    const out = layoutTimedColumns([inst("a", 6, 12)], base, base + DAY);
    expect(out[0]!.top).toBeCloseTo(6 / 24);
    expect(out[0]!.height).toBeCloseTo(6 / 24);
  });
});

describe("multi-day band layout", () => {
  const boundaries = Array.from({ length: 8 }, (_, i) => base + i * DAY);

  it("spans a 3-day band across the right columns", () => {
    const band: EventInstance = {
      ...inst("x", 0, 0),
      start: base + DAY,
      end: base + 4 * DAY,
      allDay: true,
    };
    const bands = layoutDayBands([band], boundaries);
    expect(bands).toHaveLength(1);
    expect(bands[0]!.startCol).toBe(1);
    expect(bands[0]!.endCol).toBe(3);
    expect(bands[0]!.lane).toBe(0);
  });

  it("stacks overlapping bands into separate lanes", () => {
    const a: EventInstance = { ...inst("a", 0, 0), start: base, end: base + 3 * DAY, allDay: true };
    const b: EventInstance = { ...inst("b", 0, 0), start: base + DAY, end: base + 4 * DAY, allDay: true };
    const bands = layoutDayBands([a, b], boundaries);
    expect(laneCount(bands)).toBe(2);
  });
});
