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
export declare class DayDragController {
    #private;
    /** Reactive: the live gesture in day-index space, or null. */
    active: DayDragActive | null;
    constructor(opts: DayDragOptions);
    /** Begin a create gesture from an empty day cell at `anchorDay`. */
    startCreate: (e: PointerEvent, anchorDay: number) => void;
    /** Begin a move/resize gesture on an existing band. */
    startBand: (e: PointerEvent, instance: EventInstance, mode: DayDragMode, startCol: number, endCol: number, grabDay: number) => void;
}
//# sourceMappingURL=dayDrag.svelte.d.ts.map