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
import { type DragMode, type EventInstance } from "@calidar/core";
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
export declare class GridDragController {
    #private;
    /** Reactive: the live gesture, or null. */
    active: ActiveDrag | null;
    constructor(opts: GridDragOptions);
    /** Begin a create gesture from an empty slot in column `dayIndex`. */
    startCreate: (e: PointerEvent, dayIndex: number) => void;
    /** Begin a move/resize gesture on an existing instance. */
    startEvent: (e: PointerEvent, instance: EventInstance, mode: DragMode, dayIndex: number) => void;
}
//# sourceMappingURL=gridDrag.svelte.d.ts.map