/**
 * Framework-agnostic reactive store. Holds calendar state + events, exposes a
 * `subscribe`/`getSnapshot` pair (compatible with React's
 * `useSyncExternalStore` and trivially wrappable as a Svelte store), and
 * provides the navigation / mutation actions a calendar UI needs.
 *
 * The derived view model is memoised: `getSnapshot()` returns a stable object
 * reference until state or events change, so consumers re-render only when
 * something actually changed.
 */
import type {
  CalendarEvent,
  CalendarState,
  CalendarViewKind,
  EpochRange,
} from "../types.js";
import {
  type PlainDate,
  addDays,
  addMonths,
  epochToPlainDate,
  localTimeZone,
  startOfDayEpoch,
} from "../datetime/zoned.js";
import { computeView, visibleRange, type ViewModel } from "./selectors.js";

export interface CalendarSnapshot {
  state: CalendarState;
  events: CalendarEvent[];
  view: ViewModel;
  range: EpochRange;
  now: number;
  /** Whether an event edit can be undone / redone (for toolbar buttons). */
  canUndo: boolean;
  canRedo: boolean;
}

export interface CalendarOptions {
  view?: CalendarViewKind;
  /** Initial focal instant; defaults to "now". */
  cursor?: number;
  timeZone?: string;
  weekStartsOn?: number;
  visibleDays?: number;
  hourHeight?: number;
  events?: CalendarEvent[];
  /** Max number of undo steps to keep (default 100). */
  historyLimit?: number;
  /** Injectable clock, mainly for tests. */
  now?: () => number;
}

const DEFAULTS = {
  view: "week" as CalendarViewKind,
  weekStartsOn: 1,
  visibleDays: 3,
  hourHeight: 48,
};

export class CalendarStore {
  private state: CalendarState;
  private events: CalendarEvent[];
  private readonly listeners = new Set<() => void>();
  private readonly nowFn: () => number;
  private cached: CalendarSnapshot | null = null;

  // Undo/redo history of the (immutable) events array.
  private undoStack: CalendarEvent[][] = [];
  private redoStack: CalendarEvent[][] = [];
  private readonly historyLimit: number;
  private batching = false;

  constructor(options: CalendarOptions = {}) {
    this.nowFn = options.now ?? (() => Date.now());
    this.historyLimit = Math.max(0, options.historyLimit ?? 100);
    const tz = options.timeZone ?? localTimeZone();
    this.state = {
      view: options.view ?? DEFAULTS.view,
      cursor: options.cursor ?? this.nowFn(),
      timeZone: tz,
      weekStartsOn: options.weekStartsOn ?? DEFAULTS.weekStartsOn,
      visibleDays: options.visibleDays ?? DEFAULTS.visibleDays,
      hourHeight: options.hourHeight ?? DEFAULTS.hourHeight,
    };
    this.events = options.events ? [...options.events] : [];
  }

  // ---- Reactive interface -------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CalendarSnapshot => {
    if (this.cached) return this.cached;
    const now = this.nowFn();
    this.cached = {
      state: this.state,
      events: this.events,
      view: computeView(this.state, this.events, now),
      range: visibleRange(this.state),
      now,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    };
    return this.cached;
  };

  /** Current state without triggering a view computation. */
  getState = (): CalendarState => this.state;

  private invalidate(): void {
    this.cached = null;
    if (this.batching) return; // a batch notifies once when it completes
    for (const listener of this.listeners) listener();
  }

  /** Push the current events onto the undo stack before an event mutation. */
  private record(): void {
    if (this.batching || this.historyLimit === 0) return;
    this.undoStack.push(this.events);
    if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Force recomputation (e.g. day rolled over to a new "today"). */
  refresh(): void {
    this.invalidate();
  }

  // ---- State mutations ----------------------------------------------------

  patchState(patch: Partial<CalendarState>): void {
    this.state = { ...this.state, ...patch };
    this.invalidate();
  }

  setView(view: CalendarViewKind): void {
    this.patchState({ view });
  }

  setTimeZone(timeZone: string): void {
    this.patchState({ timeZone });
  }

  setWeekStartsOn(weekStartsOn: number): void {
    this.patchState({ weekStartsOn });
  }

  setVisibleDays(visibleDays: number): void {
    this.patchState({ visibleDays: Math.max(1, visibleDays) });
  }

  setHourHeight(hourHeight: number): void {
    this.patchState({ hourHeight });
  }

  /** Move the cursor to a specific instant. */
  setCursor(epochMs: number): void {
    this.patchState({ cursor: epochMs });
  }

  /** Jump to a calendar date (placed at local midday to avoid DST edges). */
  goToDate(date: PlainDate): void {
    const epoch = startOfDayEpoch(date, this.state.timeZone) + 12 * 3_600_000;
    this.patchState({ cursor: epoch });
  }

  /** Jump to "now". */
  today(): void {
    this.patchState({ cursor: this.nowFn() });
  }

  /** Advance by one view-sized step (or `n` steps; negative goes back). */
  step(n = 1): void {
    this.patchState({ cursor: this.shiftedCursor(n) });
  }

  next(): void {
    this.step(1);
  }

  prev(): void {
    this.step(-1);
  }

  private shiftedCursor(n: number): number {
    const tz = this.state.timeZone;
    const date = epochToPlainDate(this.state.cursor, tz);
    let target: PlainDate;
    switch (this.state.view) {
      case "day":
        target = addDays(date, n);
        break;
      case "days":
        target = addDays(date, n * Math.max(1, this.state.visibleDays));
        break;
      case "week":
        target = addDays(date, n * 7);
        break;
      case "month":
        target = addMonths(date, n);
        break;
      case "agenda":
        target = addDays(date, n * 30);
        break;
    }
    return startOfDayEpoch(target, tz) + 12 * 3_600_000;
  }

  // ---- Event mutations ----------------------------------------------------

  setEvents(events: CalendarEvent[]): void {
    this.record();
    this.events = [...events];
    this.invalidate();
  }

  addEvent(event: CalendarEvent): void {
    this.record();
    this.events = [...this.events, event];
    this.invalidate();
  }

  updateEvent(id: string, patch: Partial<CalendarEvent>): void {
    this.record();
    this.events = this.events.map((e) => (e.id === id ? { ...e, ...patch } : e));
    this.invalidate();
  }

  removeEvent(id: string): void {
    this.record();
    this.events = this.events.filter((e) => e.id !== id);
    this.invalidate();
  }

  getEvents = (): CalendarEvent[] => this.events;

  // ---- Undo / redo --------------------------------------------------------

  /**
   * Group several event mutations into a single undo step (e.g. a recurrence
   * split that upserts and removes multiple events).
   */
  batch(fn: () => void): void {
    if (this.batching) {
      fn();
      return;
    }
    this.record();
    this.batching = true;
    try {
      fn();
    } finally {
      this.batching = false;
    }
    this.invalidate();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Revert the last event mutation (or batch). */
  undo(): void {
    const prev = this.undoStack.pop();
    if (prev === undefined) return;
    this.redoStack.push(this.events);
    this.events = prev;
    this.invalidate();
  }

  /** Re-apply the last undone event mutation. */
  redo(): void {
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.undoStack.push(this.events);
    this.events = next;
    this.invalidate();
  }
}

/** Convenience factory. */
export function createCalendar(options?: CalendarOptions): CalendarStore {
  return new CalendarStore(options);
}
