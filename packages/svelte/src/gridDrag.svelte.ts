/**
 * Pointer-driven drag / create / resize controller for the time grid.
 *
 * Knows no layout beyond a pixel↔time mapping supplied by the caller. It runs
 * the maths in `@calidar/core`'s `DragSession` and exposes a reactive `active`
 * preview so the view can render a ghost while a gesture is live.
 *
 * Uses Pointer Events (mouse + touch + pen) and window-level listeners, so a
 * drag that leaves the grid keeps tracking until release.
 */
import {
  DragSession,
  type DragMode,
  type EventInstance,
} from "@calidar/core";
import type { ActiveDrag } from "./types.js";

/** Geometry the controller needs to translate pointer pixels into instants. */
export interface GridMetrics {
  /** Pixels per hour. */
  hourHeight: number;
  /** Day-column start instants (epoch ms), in visual left→right order. */
  dayStarts: number[];
}

export interface GridDragOptions {
  metrics: () => GridMetrics;
  /** Resolve the grid's top edge (epoch-0 reference) in client pixels. */
  gridTop: () => number;
  /** Resolve the day-column index for a clientX, or -1 if outside. */
  columnAt: (clientX: number) => number;
  onCommit: (drag: ActiveDrag) => void;
  /** Fired when a gesture ends without meaningful movement (a click). */
  onClick?: (eventId: string | null, dayIndex: number, instant: number) => void;
  snapMinutes?: number;
}

interface DragState {
  session: DragSession;
  eventId: string | null;
  instance: EventInstance | null;
  grabDay: number;
  moved: boolean;
}

const CLICK_THRESHOLD_PX = 4;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export class GridDragController {
  /** Reactive: the live gesture, or null. */
  active = $state<ActiveDrag | null>(null);

  #opts: GridDragOptions;
  #state: DragState | null = null;
  #startXY = { x: 0, y: 0 };
  // Bound once so add/removeEventListener pair up.
  #onMove = (e: PointerEvent) => this.#handleMove(e);
  #onUp = () => this.#finish();

  constructor(opts: GridDragOptions) {
    this.#opts = opts;
  }

  /** Pointer client coords → instant on a given day column. */
  #instantAt(clientY: number, dayIndex: number): number {
    const { hourHeight, dayStarts } = this.#opts.metrics();
    const dayStart = dayStarts[dayIndex] ?? dayStarts[0] ?? 0;
    const minutes = ((clientY - this.#opts.gridTop()) / hourHeight) * 60;
    return dayStart + minutes * 60_000;
  }

  #handleMove(e: PointerEvent): void {
    const s = this.#state;
    if (!s) return;
    const dx = e.clientX - this.#startXY.x;
    const dy = e.clientY - this.#startXY.y;
    if (!s.moved && Math.hypot(dx, dy) > CLICK_THRESHOLD_PX) s.moved = true;

    const { dayStarts } = this.#opts.metrics();
    const hoverDay = clamp(this.#opts.columnAt(e.clientX), 0, dayStarts.length - 1);
    const grabStart = dayStarts[s.grabDay] ?? 0;
    const hoverStart = dayStarts[hoverDay] ?? grabStart;
    const dayShiftMs = hoverStart - grabStart;

    // The session anchors on the grab column; express the pointer there and add
    // the horizontal day shift explicitly.
    const onGrabColumn = this.#instantAt(e.clientY, s.grabDay);
    const preview = s.session.update(onGrabColumn, dayShiftMs);
    this.active = {
      preview,
      eventId: s.eventId,
      instance: s.instance,
      dayIndex: hoverDay,
    };
  }

  #finish(): void {
    window.removeEventListener("pointermove", this.#onMove);
    window.removeEventListener("pointerup", this.#onUp);
    window.removeEventListener("pointercancel", this.#onUp);
    const s = this.#state;
    const current = this.active;
    this.#state = null;
    this.active = null;
    if (!s) return;
    if (s.moved && current) {
      this.#opts.onCommit(current);
    } else if (this.#opts.onClick) {
      const instant = current ? current.preview.start : 0;
      this.#opts.onClick(s.eventId, current?.dayIndex ?? s.grabDay, instant);
    }
  }

  #startGesture(
    e: PointerEvent,
    mode: DragMode,
    dayIndex: number,
    origin: { start: number; end: number },
    eventId: string | null,
    instance: EventInstance | null,
  ): void {
    e.preventDefault();
    this.#startXY = { x: e.clientX, y: e.clientY };
    const pointerStart = this.#instantAt(e.clientY, dayIndex);
    const session = new DragSession({
      mode,
      originStart: mode === "create" ? pointerStart : origin.start,
      originEnd: mode === "create" ? pointerStart : origin.end,
      pointerStart,
      snapMinutes: this.#opts.snapMinutes ?? 15,
    });
    this.#state = { session, eventId, instance, grabDay: dayIndex, moved: false };
    this.active = { preview: session.preview, eventId, instance, dayIndex };

    window.addEventListener("pointermove", this.#onMove);
    window.addEventListener("pointerup", this.#onUp);
    window.addEventListener("pointercancel", this.#onUp);
  }

  /** Begin a create gesture from an empty slot in column `dayIndex`. */
  startCreate = (e: PointerEvent, dayIndex: number): void => {
    this.#startGesture(e, "create", dayIndex, { start: 0, end: 0 }, null, null);
  };

  /** Begin a move/resize gesture on an existing instance. */
  startEvent = (
    e: PointerEvent,
    instance: EventInstance,
    mode: DragMode,
    dayIndex: number,
  ): void => {
    if (instance.editable === false) {
      this.#opts.onClick?.(instance.eventId, dayIndex, instance.start);
      return;
    }
    e.stopPropagation();
    this.#startGesture(
      e,
      mode,
      dayIndex,
      { start: instance.start, end: instance.end },
      instance.eventId,
      instance,
    );
  };
}
