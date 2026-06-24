import { describe, expect, it } from "vitest";
import { createCalendar } from "../src/engine/store.js";
import { computeResourceView } from "../src/engine/selectors.js";
import type { CalendarEvent } from "../src/types.js";

const TZ = "Europe/Paris";
const NOON = Date.UTC(2026, 5, 23, 12); // 2026-06-23

const events: CalendarEvent[] = [
  { id: "e1", title: "A morning", start: "2026-06-23T09:00", end: "2026-06-23T10:00", resourceId: "a" },
  { id: "e2", title: "A noon", start: "2026-06-23T12:00", end: "2026-06-23T13:00", resourceId: "a" },
  { id: "e3", title: "B all-day", start: "2026-06-23", end: "2026-06-24", allDay: true, resourceId: "b" },
  { id: "e4", title: "unassigned", start: "2026-06-23T15:00", end: "2026-06-23T16:00" },
];

function makeStore() {
  return createCalendar({
    timeZone: TZ,
    cursor: NOON,
    now: () => NOON,
    resources: [
      { id: "a", title: "Room A" },
      { id: "b", title: "Room B" },
    ],
    events,
  });
}

describe("resources view", () => {
  it("splits events into one column per resource", () => {
    const store = makeStore();
    const view = computeResourceView(store.getState(), store.getEvents(), NOON);
    expect(view.columns.map((c) => c.resource.id)).toEqual(["a", "b"]);

    const a = view.columns[0]!;
    expect(a.timed).toHaveLength(2); // e1 + e2
    expect(a.allDay).toHaveLength(0);
    expect(a.timed[0]!.height).toBeGreaterThan(0); // laid-out geometry

    const b = view.columns[1]!;
    expect(b.timed).toHaveLength(0);
    expect(b.allDay.map((i) => i.eventId)).toEqual(["e3"]);
  });

  it("omits events without a matching resource", () => {
    const store = makeStore();
    const view = computeResourceView(store.getState(), store.getEvents(), NOON);
    const allIds = view.columns.flatMap((c) => [
      ...c.timed.map((t) => t.instance.eventId),
      ...c.allDay.map((i) => i.eventId),
    ]);
    expect(allIds).not.toContain("e4");
  });

  it("follows the cursor day", () => {
    const store = makeStore();
    const day0 = computeResourceView(store.getState(), store.getEvents(), NOON).date.day;
    store.setCursor(NOON + 86_400_000); // +1 day
    const day1 = computeResourceView(store.getState(), store.getEvents(), NOON).date.day;
    expect(day1).toBe(day0 + 1);
  });
});
