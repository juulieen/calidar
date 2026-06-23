import { describe, expect, it } from "vitest";
import { editRecurringEvent } from "../src/engine/recurrenceEdit.js";
import { instancesInWindow, parseDateValue } from "../src/engine/instances.js";
import { epochToWall } from "../src/datetime/zoned.js";
import type { CalendarEvent } from "../src/types.js";

const TZ = "Europe/Paris";
const HOUR = 3_600_000;
const WINDOW = { start: Date.UTC(2026, 5, 1), end: Date.UTC(2026, 6, 1) };

const series: CalendarEvent = {
  id: "m",
  title: "Standup",
  start: "2026-06-01T09:00", // Monday
  end: "2026-06-01T09:30",
  rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
  timeZone: TZ,
};

// Occurrence on Wed 2026-06-10 at 09:00 Paris.
const occ = parseDateValue("2026-06-10T09:00", TZ);

function hm(epoch: number): string {
  const w = epochToWall(epoch, TZ);
  return `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
}
function dayKey(epoch: number): string {
  const w = epochToWall(epoch, TZ);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}
function expandAll(events: CalendarEvent[]) {
  return instancesInWindow(events, WINDOW, TZ);
}

describe('edit scope "this"', () => {
  it("exdates the occurrence and detaches a moved copy", () => {
    const { update, remove } = editRecurringEvent({
      event: series,
      occurrenceStart: occ,
      scope: "this",
      patch: { start: occ + 2 * HOUR, end: occ + 2 * HOUR + 30 * 60_000 },
    });
    expect(remove).toEqual([]);
    const onJun10 = expandAll(update).filter((i) => dayKey(i.start) === "2026-06-10");
    expect(onJun10).toHaveLength(1);
    expect(hm(onJun10[0]!.start)).toBe("11:00");
    expect(onJun10[0]!.recurring).toBe(false);
    // Other occurrences untouched (Mon Jun 8 still 09:00).
    const jun8 = expandAll(update).filter((i) => dayKey(i.start) === "2026-06-08");
    expect(hm(jun8[0]!.start)).toBe("09:00");
  });
});

describe('edit scope "all"', () => {
  it("shifts the whole series", () => {
    const { update } = editRecurringEvent({
      event: series,
      occurrenceStart: occ,
      scope: "all",
      patch: { start: occ + 2 * HOUR, end: occ + 2 * HOUR + 30 * 60_000 },
    });
    expect(update).toHaveLength(1);
    const all = expandAll(update);
    // every occurrence now at 11:00
    expect(all.every((i) => hm(i.start) === "11:00")).toBe(true);
    expect(all.length).toBeGreaterThan(3);
  });
});

describe('edit scope "thisAndFollowing"', () => {
  it("caps the master and starts a new series at the occurrence", () => {
    const { update, remove } = editRecurringEvent({
      event: series,
      occurrenceStart: occ,
      scope: "thisAndFollowing",
      patch: { start: occ + 2 * HOUR, end: occ + 2 * HOUR + 30 * 60_000 },
    });
    expect(remove).toEqual([]);
    const all = expandAll(update);
    // Before the split: original 09:00 times (Mon Jun 1, Wed Jun 3, Mon Jun 8).
    const before = all.filter((i) => i.start < occ);
    expect(before.every((i) => hm(i.start) === "09:00")).toBe(true);
    expect(before.map((i) => dayKey(i.start))).toEqual([
      "2026-06-01",
      "2026-06-03",
      "2026-06-08",
    ]);
    // From the split onward: 11:00, and the cadence continues (Mon Jun 15).
    const after = all.filter((i) => i.start >= occ);
    expect(after.every((i) => hm(i.start) === "11:00")).toBe(true);
    expect(after.map((i) => dayKey(i.start))).toContain("2026-06-10");
    expect(after.map((i) => dayKey(i.start))).toContain("2026-06-15");
  });

  it("splits COUNT across the two series", () => {
    const counted: CalendarEvent = {
      id: "c",
      title: "Daily",
      start: "2026-06-01T09:00",
      end: "2026-06-01T10:00",
      rrule: "FREQ=DAILY;COUNT=4",
      timeZone: TZ,
    };
    const third = parseDateValue("2026-06-03T09:00", TZ);
    const { update } = editRecurringEvent({
      event: counted,
      occurrenceStart: third,
      scope: "thisAndFollowing",
    });
    const master = update.find((e) => e.id === "c")!;
    const split = update.find((e) => e.id !== "c")!;
    expect(master.rrule).toContain("COUNT=2");
    expect(split.rrule).toContain("COUNT=2");
    // Total occurrences preserved (4).
    expect(expandAll(update)).toHaveLength(4);
  });
});
