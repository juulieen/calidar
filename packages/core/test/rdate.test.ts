import { describe, expect, it } from "vitest";
import { instancesInWindow } from "../src/engine/instances.js";
import { epochToWall } from "../src/datetime/zoned.js";
import type { CalendarEvent } from "../src/types.js";

const TZ = "Europe/Paris";
const WIN = { start: Date.UTC(2026, 5, 1), end: Date.UTC(2026, 6, 1) };

function keys(events: CalendarEvent[]): string[] {
  return instancesInWindow(events, WIN, TZ).map((i) => {
    const w = epochToWall(i.start, TZ);
    return `${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")} ${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
  });
}

describe("RDATE", () => {
  it("adds explicit occurrences to a non-recurring event", () => {
    const ev: CalendarEvent = {
      id: "m",
      title: "Sync",
      start: "2026-06-01T09:00",
      end: "2026-06-01T10:00",
      timeZone: TZ,
      rdates: ["2026-06-03T09:00", "2026-06-05T09:00"],
    };
    expect(keys([ev])).toEqual(["06-01 09:00", "06-03 09:00", "06-05 09:00"]);
    // The master stays non-recurring; rdate instances are flagged recurring.
    const insts = instancesInWindow([ev], WIN, TZ);
    expect(insts[0]!.recurring).toBe(false);
    expect(insts[1]!.recurring).toBe(true);
  });

  it("EXDATE removes an RDATE", () => {
    const ev: CalendarEvent = {
      id: "m",
      title: "Sync",
      start: "2026-06-01T09:00",
      end: "2026-06-01T10:00",
      timeZone: TZ,
      rdates: ["2026-06-03T09:00", "2026-06-05T09:00"],
      exdates: ["2026-06-03T09:00"],
    };
    expect(keys([ev])).toEqual(["06-01 09:00", "06-05 09:00"]);
  });

  it("combines with RRULE and dedupes coincident dates", () => {
    const ev: CalendarEvent = {
      id: "m",
      title: "Standup",
      start: "2026-06-01T09:00", // Monday
      end: "2026-06-01T09:30",
      timeZone: TZ,
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      // 06-03 is an extra (Wed); 06-08 already exists as a Monday → must not duplicate.
      rdates: ["2026-06-03T09:00", "2026-06-08T09:00"],
    };
    expect(keys([ev])).toEqual([
      "06-01 09:00",
      "06-03 09:00",
      "06-08 09:00",
      "06-15 09:00",
      "06-22 09:00",
      "06-29 09:00",
    ]);
  });

  it("ignores RDATEs outside the window", () => {
    const ev: CalendarEvent = {
      id: "m",
      title: "Sync",
      start: "2026-06-10T09:00",
      end: "2026-06-10T10:00",
      timeZone: TZ,
      rdates: ["2026-07-15T09:00"], // outside June window
    };
    expect(keys([ev])).toEqual(["06-10 09:00"]);
  });
});
