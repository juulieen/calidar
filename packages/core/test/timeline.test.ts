import { describe, expect, it } from "vitest";
import { createCalendar } from "../src/engine/store.js";
import { computeTimelineView } from "../src/engine/selectors.js";
import type { CalendarEvent } from "../src/types.js";

const TZ = "UTC";
const NOON = Date.UTC(2026, 5, 23, 12); // 2026-06-23

const events: CalendarEvent[] = [
  { id: "e1", title: "Long", start: "2026-06-23T06:00", end: "2026-06-23T12:00", resourceId: "a" },
  { id: "e2", title: "Overlap", start: "2026-06-23T09:00", end: "2026-06-23T10:00", resourceId: "a" },
  { id: "e3", title: "B job", start: "2026-06-23T14:00", end: "2026-06-23T15:00", resourceId: "b" },
  { id: "e4", title: "Unassigned", start: "2026-06-23T16:00", end: "2026-06-23T17:00" },
];

function store(resources: { id: string; title: string }[]) {
  return createCalendar({ timeZone: TZ, cursor: NOON, now: () => NOON, resources, events });
}

describe("timeline view", () => {
  it("day unit: one row per resource, bars positioned across 24h", () => {
    const s = store([
      { id: "a", title: "Room A" },
      { id: "b", title: "Room B" },
    ]);
    const view = computeTimelineView(s.getState(), s.getEvents(), { unit: "day" }, NOON);

    expect(view.kind).toBe("timeline");
    expect(view.slots).toHaveLength(24);
    expect(view.rows.map((r) => r.resource?.id)).toEqual(["a", "b"]);

    const a = view.rows[0]!;
    expect(a.bars).toHaveLength(2);
    const e1 = a.bars.find((b) => b.instance.eventId === "e1")!;
    expect(e1.left).toBeCloseTo(6 / 24);
    expect(e1.width).toBeCloseTo(6 / 24);
    // e2 overlaps e1 → it gets a second lane.
    expect(a.lanes).toBe(2);
    const e2 = a.bars.find((b) => b.instance.eventId === "e2")!;
    expect(e2.lane).toBe(1);

    const b = view.rows[1]!;
    expect(b.bars).toHaveLength(1);
    expect(b.bars[0]!.left).toBeCloseTo(14 / 24);
    expect(b.bars[0]!.lane).toBe(0);
    // e4 has no resource → absent.
    const allIds = view.rows.flatMap((r) => r.bars.map((bar) => bar.instance.eventId));
    expect(allIds).not.toContain("e4");
  });

  it("day unit: marks isNow on exactly the hour slot covering now", () => {
    const s = store([{ id: "a", title: "A" }]);
    // now = 2026-06-23 12:34 UTC → slot for hour 12 covers it.
    const now = Date.UTC(2026, 5, 23, 12, 34);
    const view = computeTimelineView(s.getState(), s.getEvents(), { unit: "day" }, now);

    const nowSlots = view.slots.filter((sl) => sl.isNow);
    expect(nowSlots).toHaveLength(1);
    const idx = view.slots.findIndex((sl) => sl.isNow);
    expect(idx).toBe(12);
    expect(view.slots[12]!.start).toBe(Date.UTC(2026, 5, 23, 12));
  });

  it("day unit: no slot is isNow when the displayed day is not today", () => {
    const s = store([{ id: "a", title: "A" }]);
    // now is the previous day → none of the 23rd's hour slots cover it.
    const now = Date.UTC(2026, 5, 22, 12);
    const view = computeTimelineView(s.getState(), s.getEvents(), { unit: "day" }, now);
    expect(view.slots.some((sl) => sl.isNow)).toBe(false);
  });

  it("falls back to a single catch-all row when no resources", () => {
    const s = store([]);
    const view = computeTimelineView(s.getState(), s.getEvents(), { unit: "day" }, NOON);
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]!.resource).toBeNull();
    expect(view.rows[0]!.bars).toHaveLength(4); // all events incl. unassigned
  });

  it("week unit exposes 7 day slots", () => {
    const s = store([{ id: "a", title: "A" }]);
    const view = computeTimelineView(s.getState(), s.getEvents(), { unit: "week" }, NOON);
    expect(view.unit).toBe("week");
    expect(view.slots).toHaveLength(7);
    expect(view.slots.some((sl) => sl.isNow)).toBe(true); // today is in the week
  });

  it("month unit exposes one slot per day", () => {
    const s = store([{ id: "a", title: "A" }]);
    const view = computeTimelineView(s.getState(), s.getEvents(), { unit: "month" }, NOON);
    expect(view.slots).toHaveLength(30); // June
  });
});
