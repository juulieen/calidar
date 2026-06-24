/**
 * Adapter-level types: the callback contract Calendar exposes to host apps and
 * the geometry passed into the grid-drag controller.
 */
import type { DragPreview, EventInstance } from "@calidar/core";
/** A new event the user sketched in an empty slot (drag-to-create). */
export interface SlotSelection {
    start: number;
    end: number;
    allDay: boolean;
    /** Resource the slot belongs to, when drafted in the Resources view. */
    resourceId?: string;
}
/** Scope of a recurring-series edit, mirroring the core's `RecurrenceEditScope`. */
export type RecurringEditScope = "this" | "thisAndFollowing" | "all";
/**
 * A pending edit of one occurrence of a recurring series. Surfaced to hosts via
 * `onRecurringEdit`; if no host handler resolves it, the adapter shows its own
 * scope picker and applies the result to the store.
 */
export interface RecurringEditRequest {
    /** The instance the user dragged/resized (carries `source`, original bounds). */
    instance: EventInstance;
    /** New bounds produced by the gesture. */
    patch: {
        start: number;
        end: number;
    };
    /** Original occurrence start (epoch ms), before the gesture. */
    occurrenceStart: number;
}
/** Callbacks a host wires onto `<Calendar>`. All optional. */
export interface CalendarCallbacks {
    /** Fired when a create gesture commits a non-trivial slot. */
    onEventCreate?: (selection: SlotSelection) => void;
    /** Fired after a move/resize gesture commits new bounds for an event. */
    onEventUpdate?: (eventId: string, patch: {
        start: number;
        end: number;
    }) => void;
    /** Fired on a plain click/tap on an existing instance. */
    onEventClick?: (instance: EventInstance) => void;
    /** Fired on a plain click/tap on an empty slot (no drag). */
    onSelectSlot?: (selection: SlotSelection) => void;
    /**
     * Fired when a move/resize lands on a recurring instance. Return a scope to
     * resolve the edit yourself (the adapter still applies the core mutation), or
     * return/leave `undefined` to let the adapter show its built-in scope picker.
     */
    onRecurringEdit?: (request: RecurringEditRequest) => RecurringEditScope | void | undefined;
}
/** Live state of an in-progress pointer gesture, for ghost rendering. */
export interface ActiveDrag {
    preview: DragPreview;
    /** Event id being edited, or null for a create gesture. */
    eventId: string | null;
    /** The instance being edited, or null for a create gesture. */
    instance: EventInstance | null;
    /** Day-column index currently under the pointer. */
    dayIndex: number;
}
//# sourceMappingURL=types.d.ts.map