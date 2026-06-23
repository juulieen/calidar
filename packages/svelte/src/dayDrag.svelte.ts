/**
 * Pointer-driven, day-snapping drag controller for whole-day surfaces: the
 * time-grid all-day band row and the Month grid.
 *
 * Unlike `GridDragController` (which snaps to minutes within a day column),
 * this controller snaps to whole calendar days. The caller supplies the day
 * boundaries (`dayStart`/`dayEnd` epoch ms) for every visible day and a way to
 * resolve which day a pointer sits over. The controller tracks a move / resize /
 * create gesture across the visible days and exposes a reactive `active`
 * preview expressed as **day indices** so a view can render a ghost band.
 *
 * Uses Pointer Events (mouse + touch + pen) and window-level listeners so a
 * gesture that leaves the surface keeps tracking until release.
 */
import type { EventInstance } from "@calidar/core";

export type DayDragMode = "move" | "resize-start" | "resize-end" | "create";

/** Geometry the controller needs: one entry per visible day, left→right. */
export interface DayMetrics {
  /** Day start instants (epoch ms), in visual order. */
  dayStarts: number[];
  /** Matching day end instants (epoch ms, exclusive) — handles DST. */
  dayEnds: number[];
}

/** Live preview of an in-progress day gesture, in day-index space. */
export interface DayDragActive {
  /** First covered day index (inclusive). */
  startDay: number;
  /** Last covered day index (inclusive). */
  endDay: number;
  mode: DayDragMode;
  /** Event id being edited, or null for a create gesture. */
  eventId: string | null;
  /** Instance being edited, or null for a create gesture. */
  instance: EventInstance | null;
}

/** Result handed to `onCommit`, resolved to absolute epoch bounds. */
export interface DayCommit {
  /** Inclusive first day index. */
  startDay: number;
  /** Inclusive last day index. */
  endDay: number;
  /** All-day start: first day 00:00 (epoch ms). */
  start: number;
  /** All-day end: last day +1 at 00:00 (exclusive, epoch ms). */
  end: number;
  mode: DayDragMode;
  eventId: string | null;
  instance: EventInstance | null;
}

export interface DayDragOptions {
  metrics: () => DayMetrics;
  /** Resolve the day index for a clientX/clientY, or -1 if outside. */
  dayAt: (clientX: number, clientY: number) => number;
  onCommit: (commit: DayCommit) => void;
  /** Fired when a gesture ends without crossing the click threshold. */
  onClick?: (active: DayDragActive) => void;
}

interface DayState {
  mode: DayDragMode;
  eventId: string | null;
  instance: EventInstance | null;
  /** Day index where the pointer first went down. */
  anchorDay: number;
  /** For move: the band's original [startDay, endDay] at grab time. */
  originStart: number;
  originEnd: number;
  moved: boolean;
}

const CLICK_THRESHOLD_PX = 4;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export class DayDragController {
  /** Reactive: the live gesture in day-index space, or null. */
  active = $state<DayDragActive | null>(null);

  #opts: DayDragOptions;
  #state: DayState | null = null;
  #startXY = { x: 0, y: 0 };
  #onMove = (e: PointerEvent) => this.#handleMove(e);
  #onUp = () => this.#finish();

  constructor(opts: DayDragOptions) {
    this.#opts = opts;
  }

  #dayCount(): number {
    return this.#opts.metrics().dayStarts.length;
  }

  #hoverDay(e: PointerEvent): number {
    const n = this.#dayCount();
    const raw = this.#opts.dayAt(e.clientX, e.clientY);
    return clamp(raw < 0 ? this.#state?.anchorDay ?? 0 : raw, 0, n - 1);
  }

  #handleMove(e: PointerEvent): void {
    const s = this.#state;
    if (!s) return;
    const dx = e.clientX - this.#startXY.x;
    const dy = e.clientY - this.#startXY.y;
    if (!s.moved && Math.hypot(dx, dy) > CLICK_THRESHOLD_PX) s.moved = true;

    const hover = this.#hoverDay(e);
    const n = this.#dayCount();
    let startDay = s.originStart;
    let endDay = s.originEnd;

    switch (s.mode) {
      case "create": {
        startDay = Math.min(s.anchorDay, hover);
        endDay = Math.max(s.anchorDay, hover);
        break;
      }
      case "move": {
        const span = s.originEnd - s.originStart;
        let shift = hover - s.anchorDay;
        // Keep the whole band inside the visible range.
        shift = clamp(shift, -s.originStart, n - 1 - s.originEnd);
        startDay = s.originStart + shift;
        endDay = startDay + span;
        break;
      }
      case "resize-start": {
        startDay = Math.min(hover, s.originEnd);
        endDay = s.originEnd;
        break;
      }
      case "resize-end": {
        startDay = s.originStart;
        endDay = Math.max(hover, s.originStart);
        break;
      }
    }

    this.active = {
      startDay,
      endDay,
      mode: s.mode,
      eventId: s.eventId,
      instance: s.instance,
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
    if (!s || !current) return;
    if (s.moved) {
      const { dayStarts, dayEnds } = this.#opts.metrics();
      const start = dayStarts[current.startDay];
      const end = dayEnds[current.endDay];
      if (start === undefined || end === undefined) return;
      this.#opts.onCommit({
        startDay: current.startDay,
        endDay: current.endDay,
        start,
        end,
        mode: s.mode,
        eventId: s.eventId,
        instance: s.instance,
      });
    } else {
      this.#opts.onClick?.(current);
    }
  }

  #start(
    e: PointerEvent,
    mode: DayDragMode,
    anchorDay: number,
    originStart: number,
    originEnd: number,
    eventId: string | null,
    instance: EventInstance | null,
  ): void {
    e.preventDefault();
    this.#startXY = { x: e.clientX, y: e.clientY };
    this.#state = {
      mode,
      eventId,
      instance,
      anchorDay,
      originStart,
      originEnd,
      moved: false,
    };
    this.active = {
      startDay: originStart,
      endDay: originEnd,
      mode,
      eventId,
      instance,
    };
    window.addEventListener("pointermove", this.#onMove);
    window.addEventListener("pointerup", this.#onUp);
    window.addEventListener("pointercancel", this.#onUp);
  }

  /** Begin a create gesture from an empty day cell at `anchorDay`. */
  startCreate = (e: PointerEvent, anchorDay: number): void => {
    if (e.button !== 0) return;
    this.#start(e, "create", anchorDay, anchorDay, anchorDay, null, null);
  };

  /** Begin a move/resize gesture on an existing band. */
  startBand = (
    e: PointerEvent,
    instance: EventInstance,
    mode: DayDragMode,
    startCol: number,
    endCol: number,
    grabDay: number,
  ): void => {
    if (instance.editable === false) {
      this.#opts.onClick?.({
        startDay: startCol,
        endDay: endCol,
        mode,
        eventId: instance.eventId,
        instance,
      });
      return;
    }
    e.stopPropagation();
    this.#start(e, mode, grabDay, startCol, endCol, instance.eventId, instance);
  };
}
