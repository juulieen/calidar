import { describe, expect, it } from "vitest";
import { createCalendar } from "../src/engine/store.js";
import type { CalendarEvent } from "../src/types.js";

const a: CalendarEvent = { id: "a", title: "A", start: "2026-06-01T09:00", end: "2026-06-01T10:00" };
const b: CalendarEvent = { id: "b", title: "B", start: "2026-06-02T09:00", end: "2026-06-02T10:00" };
const c: CalendarEvent = { id: "c", title: "C", start: "2026-06-03T09:00", end: "2026-06-03T10:00" };

function ids(store: ReturnType<typeof createCalendar>): string[] {
  return store.getEvents().map((e) => e.id);
}

describe("undo / redo", () => {
  it("undoes and redoes an add", () => {
    const s = createCalendar({ events: [a] });
    expect(s.canUndo()).toBe(false);
    s.addEvent(b);
    expect(ids(s)).toEqual(["a", "b"]);
    expect(s.canUndo()).toBe(true);

    s.undo();
    expect(ids(s)).toEqual(["a"]);
    expect(s.canRedo()).toBe(true);

    s.redo();
    expect(ids(s)).toEqual(["a", "b"]);
  });

  it("undoes update and remove", () => {
    const s = createCalendar({ events: [a] });
    s.updateEvent("a", { title: "A2" });
    expect(s.getEvents()[0]!.title).toBe("A2");
    s.undo();
    expect(s.getEvents()[0]!.title).toBe("A");

    s.removeEvent("a");
    expect(ids(s)).toEqual([]);
    s.undo();
    expect(ids(s)).toEqual(["a"]);
  });

  it("a new mutation clears the redo stack", () => {
    const s = createCalendar({ events: [a] });
    s.addEvent(b);
    s.undo();
    expect(s.canRedo()).toBe(true);
    s.addEvent(c); // diverges
    expect(s.canRedo()).toBe(false);
    expect(ids(s)).toEqual(["a", "c"]);
  });

  it("batch() groups mutations into a single undo step", () => {
    const s = createCalendar({ events: [a] });
    s.batch(() => {
      s.addEvent(b);
      s.addEvent(c);
      s.updateEvent("a", { title: "A2" });
    });
    expect(ids(s)).toEqual(["a", "b", "c"]);
    expect(s.getEvents()[0]!.title).toBe("A2");

    s.undo(); // one step reverts the whole batch
    expect(ids(s)).toEqual(["a"]);
    expect(s.getEvents()[0]!.title).toBe("A");
  });

  it("respects historyLimit", () => {
    const s = createCalendar({ events: [], historyLimit: 2 });
    s.addEvent(a);
    s.addEvent(b);
    s.addEvent(c); // 3 mutations, only 2 kept
    s.undo();
    s.undo();
    expect(s.canUndo()).toBe(false); // oldest step dropped
    expect(ids(s)).toEqual(["a"]); // can't go back to []
  });

  it("exposes canUndo/canRedo on the snapshot", () => {
    const s = createCalendar({ events: [a] });
    expect(s.getSnapshot().canUndo).toBe(false);
    s.addEvent(b);
    expect(s.getSnapshot().canUndo).toBe(true);
    s.undo();
    expect(s.getSnapshot().canRedo).toBe(true);
  });
});
