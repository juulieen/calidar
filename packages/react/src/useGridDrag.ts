/**
 * Pointer-driven drag/create/resize for the time grid.
 *
 * The hook owns no layout knowledge beyond a pixel↔time mapping supplied by the
 * caller. It runs the maths in `@calidar/core`'s `DragSession` and exposes a
 * live `preview` so the view can render a ghost while the gesture is active.
 *
 * Uses Pointer Events (mouse + touch + pen) and pointer capture, so a drag that
 * leaves the grid keeps tracking until release.
 */
import { useCallback, useRef, useState } from "react";
import {
  DragSession,
  type DragMode,
  type DragPreview,
  type EventInstance,
} from "@calidar/core";

/** Geometry the hook needs to translate pointer pixels into instants. */
export interface GridMetrics {
  /** Pixels per hour. */
  hourHeight: number;
  /** Day-column start instants (epoch ms), in visual left→right order. */
  dayStarts: number[];
}

export interface ActiveDrag {
  preview: DragPreview;
  /** Event id being edited, or null for a create gesture. */
  eventId: string | null;
  /** The instance being edited, or null for a create gesture. Carries the
   *  recurrence flag, series `source`, and the original start/end. */
  instance: EventInstance | null;
  /** Day-column index currently under the pointer. */
  dayIndex: number;
}

export interface GridDragHandlers {
  active: ActiveDrag | null;
  /** Begin a create gesture from an empty slot in column `dayIndex`. */
  startCreate: (e: React.PointerEvent, dayIndex: number) => void;
  /** Begin a move/resize gesture on an existing instance. */
  startEvent: (
    e: React.PointerEvent,
    instance: EventInstance,
    mode: DragMode,
    dayIndex: number,
  ) => void;
}

interface DragState {
  session: DragSession;
  eventId: string | null;
  instance: EventInstance | null;
  /** Day-column index where the pointer grab started. */
  grabDay: number;
  /** Whether the pointer has moved past the click threshold. */
  moved: boolean;
}

const CLICK_THRESHOLD_PX = 4;

export interface UseGridDragOptions {
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

export function useGridDrag(opts: UseGridDragOptions): GridDragHandlers {
  const [active, setActiveState] = useState<ActiveDrag | null>(null);
  // Mirror `active` in a ref so the `pointerup` listener (registered once per
  // gesture) always reads the latest preview rather than a stale closure.
  const activeRef = useRef<ActiveDrag | null>(null);
  const setActive = useCallback((next: ActiveDrag | null) => {
    activeRef.current = next;
    setActiveState(next);
  }, []);
  const stateRef = useRef<DragState | null>(null);
  const startXY = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  /** Pointer client coords → instant on a given day column. */
  const instantAt = useCallback(
    (clientY: number, dayIndex: number): number => {
      const { hourHeight, dayStarts } = opts.metrics();
      const dayStart = dayStarts[dayIndex] ?? dayStarts[0] ?? 0;
      const minutes = ((clientY - opts.gridTop()) / hourHeight) * 60;
      return dayStart + minutes * 60_000;
    },
    [opts],
  );

  const finish = useCallback(() => {
    const s = stateRef.current;
    stateRef.current = null;
    const current = activeRef.current;
    setActive(null);
    if (!s) return;
    if (s.moved && current) {
      opts.onCommit(current);
    } else if (opts.onClick) {
      const instant = current ? current.preview.start : 0;
      opts.onClick(s.eventId, current?.dayIndex ?? s.grabDay, instant);
    }
  }, [opts, setActive]);

  const handleMove = useCallback(
    (e: PointerEvent) => {
      const s = stateRef.current;
      if (!s) return;
      const dx = e.clientX - startXY.current.x;
      const dy = e.clientY - startXY.current.y;
      if (!s.moved && Math.hypot(dx, dy) > CLICK_THRESHOLD_PX) s.moved = true;

      const { dayStarts } = opts.metrics();
      const hoverDay = clamp(opts.columnAt(e.clientX), 0, dayStarts.length - 1);
      const pointerInstant = instantAt(e.clientY, hoverDay);

      // Horizontal day shift only matters for "move"/"create": shift by the
      // difference between the grabbed column and the hovered column.
      const grabStart = dayStarts[s.grabDay] ?? 0;
      const hoverStart = dayStarts[hoverDay] ?? grabStart;
      const dayShiftMs = hoverStart - grabStart;

      // For create, the pointer instant must be expressed on the grab column
      // (the session anchors there); add the day shift explicitly.
      const onGrabColumn = instantAt(e.clientY, s.grabDay);
      const preview = s.session.update(onGrabColumn, dayShiftMs);

      setActive({
        preview,
        eventId: s.eventId,
        instance: s.instance,
        dayIndex: hoverDay,
      });
    },
    [instantAt, opts],
  );

  const startGesture = useCallback(
    (
      e: React.PointerEvent,
      mode: DragMode,
      dayIndex: number,
      origin: { start: number; end: number },
      eventId: string | null,
      instance: EventInstance | null,
    ) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      startXY.current = { x: e.clientX, y: e.clientY };

      const pointerStart = instantAt(e.clientY, dayIndex);
      const session = new DragSession({
        mode,
        originStart: mode === "create" ? pointerStart : origin.start,
        originEnd: mode === "create" ? pointerStart : origin.end,
        pointerStart,
        snapMinutes: opts.snapMinutes ?? 15,
      });
      stateRef.current = {
        session,
        eventId,
        instance,
        grabDay: dayIndex,
        moved: false,
      };
      setActive({
        preview: session.preview,
        eventId,
        instance,
        dayIndex,
      });

      const up = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        finish();
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [finish, handleMove, instantAt, opts.snapMinutes],
  );

  const startCreate = useCallback(
    (e: React.PointerEvent, dayIndex: number) => {
      startGesture(e, "create", dayIndex, { start: 0, end: 0 }, null, null);
    },
    [startGesture],
  );

  const startEvent = useCallback(
    (
      e: React.PointerEvent,
      instance: EventInstance,
      mode: DragMode,
      dayIndex: number,
    ) => {
      if (instance.editable === false) {
        // Non-editable: still allow click selection, not drag.
        if (opts.onClick) opts.onClick(instance.eventId, dayIndex, instance.start);
        return;
      }
      e.stopPropagation();
      startGesture(
        e,
        mode,
        dayIndex,
        { start: instance.start, end: instance.end },
        instance.eventId,
        instance,
      );
    },
    [opts, startGesture],
  );

  return { active, startCreate, startEvent };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
