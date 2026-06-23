/**
 * Pointer-driven drag/create/resize snapped to *whole days* (Solid port).
 *
 * Powers the time-grid all-day band and the month grid: a gesture is mapped to
 * a day-column index (via a caller-supplied `columnAt`) and the preview is
 * always a span of whole days. For an all-day span the convention is:
 *   start = dayStart of the first day (00:00),
 *   end   = dayEnd of the last day (next day 00:00, exclusive),
 * taken from the view-model's own `dayStart`/`dayEnd` so DST is handled by core.
 *
 * Uses Pointer Events (mouse + touch + pen) with pointer capture so a gesture
 * that leaves the grid keeps tracking until release.
 */
import { createSignal, type Accessor } from "solid-js";
import type { EventInstance } from "@calidar/core";

/** A day column the gesture can land on. */
export interface DayCell {
  /** Midnight of this day (epoch ms). */
  dayStart: number;
  /** Next midnight (epoch ms, exclusive end). */
  dayEnd: number;
}

export type DayDragMode = "create" | "move" | "resize-start" | "resize-end";

export interface ActiveDayDrag {
  /** Inclusive first/last day-column index of the previewed span. */
  startCol: number;
  endCol: number;
  /** Absolute span bounds (epoch ms), `[start, end)` — end exclusive. */
  start: number;
  end: number;
  /** Event id being edited, or null for a create gesture. */
  eventId: string | null;
  /** The instance being edited (recurrence flag + series source), or null. */
  instance: EventInstance | null;
  mode: DayDragMode;
}

export interface DayDragCommit {
  start: number;
  end: number;
  eventId: string | null;
  instance: EventInstance | null;
}

export interface UseDayDragOptions {
  /** The day columns, in visual left→right order. */
  cells: () => DayCell[];
  /**
   * Resolve the day-column index for a pointer position (clamped by the hook).
   * `clientY` is supplied so a 2-D grid (e.g. the Month view) can map across
   * rows; single-row consumers may ignore it.
   */
  columnAt: (clientX: number, clientY: number) => number;
  onCommit: (commit: DayDragCommit) => void;
  /** Fired when a gesture ends without crossing the click threshold. */
  onClick?: (instance: EventInstance | null, col: number) => void;
}

export interface DayDragHandlers {
  active: Accessor<ActiveDayDrag | null>;
  /** Begin a create gesture anchored on column `col`. */
  startCreate: (e: PointerEvent, col: number) => void;
  /** Begin a move/resize gesture on an existing instance occupying
   *  `[startCol, endCol]`. */
  startEvent: (
    e: PointerEvent,
    instance: EventInstance,
    mode: DayDragMode,
    startCol: number,
    endCol: number,
  ) => void;
}

interface DayDragState {
  mode: DayDragMode;
  eventId: string | null;
  instance: EventInstance | null;
  /** Column where the pointer grabbed. */
  grabCol: number;
  /** Original span columns at gesture start. */
  originStart: number;
  originEnd: number;
  moved: boolean;
}

const CLICK_THRESHOLD_PX = 4;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function useDayDrag(opts: UseDayDragOptions): DayDragHandlers {
  const [active, setActiveState] = createSignal<ActiveDayDrag | null>(null);
  // Mirror `active` in a plain var so the once-registered `pointerup` listener
  // reads the latest preview instead of a stale closure (see useGridDrag).
  let activeRef: ActiveDayDrag | null = null;
  const setActive = (next: ActiveDayDrag | null): void => {
    activeRef = next;
    setActiveState(next);
  };
  let stateRef: DayDragState | null = null;
  let startXY = { x: 0, y: 0 };

  const compute = (s: DayDragState, hoverCol: number): ActiveDayDrag | null => {
    const cells = opts.cells();
    if (cells.length === 0) return null;
    const last = cells.length - 1;
    let startCol: number;
    let endCol: number;

    if (s.mode === "create") {
      startCol = Math.min(s.grabCol, hoverCol);
      endCol = Math.max(s.grabCol, hoverCol);
    } else if (s.mode === "resize-start") {
      startCol = Math.min(hoverCol, s.originEnd);
      endCol = s.originEnd;
    } else if (s.mode === "resize-end") {
      startCol = s.originStart;
      endCol = Math.max(hoverCol, s.originStart);
    } else {
      // move: shift the whole span by (hover - grab) columns.
      const shift = hoverCol - s.grabCol;
      const span = s.originEnd - s.originStart;
      startCol = clamp(s.originStart + shift, 0, last - span);
      endCol = startCol + span;
    }

    startCol = clamp(startCol, 0, last);
    endCol = clamp(endCol, 0, last);
    const startCell = cells[startCol];
    const endCell = cells[endCol];
    if (!startCell || !endCell) return null;
    return {
      startCol,
      endCol,
      start: startCell.dayStart,
      end: endCell.dayEnd,
      eventId: s.eventId,
      instance: s.instance,
      mode: s.mode,
    };
  };

  const finish = (): void => {
    const s = stateRef;
    stateRef = null;
    const current = activeRef;
    setActive(null);
    if (!s) return;
    if (s.moved && current) {
      opts.onCommit({
        start: current.start,
        end: current.end,
        eventId: current.eventId,
        instance: current.instance,
      });
    } else if (opts.onClick) {
      opts.onClick(s.instance, current?.startCol ?? s.grabCol);
    }
  };

  const handleMove = (e: PointerEvent): void => {
    const s = stateRef;
    if (!s) return;
    const dx = e.clientX - startXY.x;
    const dy = e.clientY - startXY.y;
    if (!s.moved && Math.hypot(dx, dy) > CLICK_THRESHOLD_PX) s.moved = true;

    const cells = opts.cells();
    const hoverCol = clamp(opts.columnAt(e.clientX, e.clientY), 0, cells.length - 1);
    const next = compute(s, hoverCol);
    if (next) setActive(next);
  };

  const startGesture = (
    e: PointerEvent,
    mode: DayDragMode,
    grabCol: number,
    originStart: number,
    originEnd: number,
    eventId: string | null,
    instance: EventInstance | null,
  ): void => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    startXY = { x: e.clientX, y: e.clientY };

    const s: DayDragState = {
      mode,
      eventId,
      instance,
      grabCol,
      originStart,
      originEnd,
      moved: false,
    };
    stateRef = s;
    const init = compute(s, grabCol);
    if (init) setActive(init);

    const up = (): void => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      finish();
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const startCreate = (e: PointerEvent, col: number): void => {
    startGesture(e, "create", col, col, col, null, null);
  };

  const startEvent = (
    e: PointerEvent,
    instance: EventInstance,
    mode: DayDragMode,
    startCol: number,
    endCol: number,
  ): void => {
    if (instance.editable === false) {
      if (opts.onClick) opts.onClick(instance, startCol);
      return;
    }
    e.stopPropagation();
    startGesture(e, mode, startCol, startCol, endCol, instance.eventId, instance);
  };

  return { active, startCreate, startEvent };
}
