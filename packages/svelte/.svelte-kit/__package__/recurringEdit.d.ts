/**
 * Shared logic for committing a move/resize that landed on an event instance.
 *
 * Non-recurring instances commit directly (patch the master). Recurring
 * instances need the user's scope choice ("this" / "thisAndFollowing" / "all"),
 * after which we run the core's pure `editRecurringEvent` and apply the
 * resulting upserts/removals to the store.
 */
import { type CalendarStore, type EventInstance } from "@calidar/core";
import type { CalendarCallbacks, RecurringEditScope } from "./types.js";
/** Bounds produced by a gesture. */
export interface EditBounds {
    start: number;
    end: number;
}
/**
 * Commit a plain (non-recurring) move/resize: patch the master event and notify.
 */
export declare function commitDirect(store: CalendarStore, callbacks: CalendarCallbacks, eventId: string, patch: EditBounds): void;
/**
 * Apply a recurring-series edit at the chosen scope. Runs the pure core
 * mutation and reconciles it against the store (upsert vs add, plus removals),
 * then notifies via `onEventUpdate`.
 *
 * `occurrenceStart` MUST be the instance's original start (before the gesture).
 */
export declare function applyRecurringEdit(store: CalendarStore, callbacks: CalendarCallbacks, instance: EventInstance, occurrenceStart: number, patch: EditBounds, scope: RecurringEditScope, timeZone: string): void;
/**
 * Route a committed gesture to the right path:
 *  - non-recurring → commit directly, return null.
 *  - recurring + host `onRecurringEdit` returns a scope → apply it, return null.
 *  - recurring + no host resolution → return a pending request so the caller
 *    shows the built-in scope picker.
 */
export declare function routeCommit(store: CalendarStore, callbacks: CalendarCallbacks, instance: EventInstance, occurrenceStart: number, patch: EditBounds, timeZone: string): {
    instance: EventInstance;
    occurrenceStart: number;
    patch: EditBounds;
} | null;
//# sourceMappingURL=recurringEdit.d.ts.map