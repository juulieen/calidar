import { describe, expect, it } from "vitest";
import {
  constrainInterval,
  intervalsOverlap,
  hasConflict,
  firstFreeSlot,
} from "../src/interactions/constraints.js";

const MIN = 60_000;
const HOUR = 3_600_000;
const base = Date.UTC(2026, 5, 23, 9, 0, 0);

describe("constrainInterval", () => {
  it("snaps to a granularity", () => {
    const out = constrainInterval(
      { start: base + 7 * MIN, end: base + 52 * MIN },
      { snapMinutes: 15 },
    );
    expect((out.start - base) / MIN).toBe(0); // 7 -> 0
    expect((out.end - base) / MIN).toBe(45); // 52 -> 45
  });

  it("enforces min and max duration", () => {
    const min = constrainInterval(
      { start: base, end: base + 5 * MIN },
      { minDurationMs: 15 * MIN },
    );
    expect(min.end - min.start).toBe(15 * MIN);

    const max = constrainInterval(
      { start: base, end: base + 5 * HOUR },
      { maxDurationMs: 2 * HOUR },
    );
    expect(max.end - max.start).toBe(2 * HOUR);
  });

  it("clamps within bounds, preserving duration", () => {
    const lower = constrainInterval(
      { start: base - HOUR, end: base },
      { minStart: base },
    );
    expect(lower.start).toBe(base);
    expect(lower.end - lower.start).toBe(HOUR);

    const upper = constrainInterval(
      { start: base + 3 * HOUR, end: base + 4 * HOUR },
      { maxEnd: base + 3.5 * HOUR },
    );
    expect(upper.end).toBe(base + 3.5 * HOUR);
    expect(upper.end - upper.start).toBe(HOUR);
  });
});

describe("overlap helpers", () => {
  it("detects overlap and ignores a key", () => {
    expect(intervalsOverlap({ start: 0, end: 10 }, { start: 5, end: 15 })).toBe(true);
    expect(intervalsOverlap({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);

    const busy = [
      { start: base, end: base + HOUR, key: "a" },
      { start: base + 2 * HOUR, end: base + 3 * HOUR, key: "b" },
    ];
    expect(hasConflict({ start: base + 30 * MIN, end: base + 90 * MIN }, busy)).toBe(true);
    // ignoring "a" removes the conflict with the first block
    expect(
      hasConflict({ start: base, end: base + HOUR }, busy, "a"),
    ).toBe(false);
  });

  it("finds the first free slot after busy blocks", () => {
    const busy = [
      { start: base, end: base + HOUR },
      { start: base + HOUR, end: base + 2 * HOUR },
    ];
    const slot = firstFreeSlot(base, HOUR, busy);
    expect(slot.start).toBe(base + 2 * HOUR);
    expect(slot.end).toBe(base + 3 * HOUR);
  });
});
