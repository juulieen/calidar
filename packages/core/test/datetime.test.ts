import { describe, expect, it } from "vitest";
import {
  epochToWall,
  offsetMinutesAt,
  wallToEpoch,
  startOfWeek,
  isoWeekday,
  addMonths,
} from "../src/datetime/zoned.js";

describe("timezone offsets", () => {
  it("knows Paris winter vs summer offset", () => {
    const jan = Date.UTC(2026, 0, 15, 12, 0, 0);
    const jul = Date.UTC(2026, 6, 15, 12, 0, 0);
    expect(offsetMinutesAt(jan, "Europe/Paris")).toBe(60);
    expect(offsetMinutesAt(jul, "Europe/Paris")).toBe(120);
  });

  it("UTC offset is always zero", () => {
    expect(offsetMinutesAt(Date.now(), "UTC")).toBe(0);
  });
});

describe("wall <-> epoch round trips", () => {
  it("round-trips a summer wall time in Paris", () => {
    const wall = { year: 2026, month: 7, day: 15, hour: 9, minute: 30, second: 0, millisecond: 0 };
    const epoch = wallToEpoch(wall, "Europe/Paris");
    expect(epochToWall(epoch, "Europe/Paris")).toEqual(wall);
  });

  it("resolves a spring-forward gap forward", () => {
    // 2026-03-29 02:30 does not exist in Paris (clocks jump 02:00 -> 03:00).
    const epoch = wallToEpoch(
      { year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0, millisecond: 0 },
      "Europe/Paris",
    );
    const back = epochToWall(epoch, "Europe/Paris");
    // It should land at a real instant (03:30, summer time), not throw.
    expect(back.hour).toBe(3);
    expect(back.minute).toBe(30);
  });
});

describe("calendar helpers", () => {
  it("computes ISO weekday", () => {
    expect(isoWeekday({ year: 2026, month: 6, day: 22 })).toBe(1); // Monday
    expect(isoWeekday({ year: 2026, month: 6, day: 28 })).toBe(7); // Sunday
  });

  it("starts the week on Monday by default", () => {
    const wk = startOfWeek({ year: 2026, month: 6, day: 24 }, 1); // Wed
    expect(wk).toEqual({ year: 2026, month: 6, day: 22 });
  });

  it("clamps day when adding months", () => {
    expect(addMonths({ year: 2026, month: 1, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });
});
