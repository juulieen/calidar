/**
 * Shared logic for committing a move/resize that landed on an event instance.
 *
 * Non-recurring instances commit directly (patch the master). Recurring
 * instances need the user's scope choice ("this" / "thisAndFollowing" / "all"),
 * after which we run the core's pure `editRecurringEvent` and apply the
 * resulting upserts/removals to the store.
 */
import { editRecurringEvent, } from "@calidar/core";
/**
 * Commit a plain (non-recurring) move/resize: patch the master event and notify.
 */
export function commitDirect(store, callbacks, eventId, patch) {
    store.updateEvent(eventId, { start: patch.start, end: patch.end });
    callbacks.onEventUpdate?.(eventId, { start: patch.start, end: patch.end });
}
/**
 * Apply a recurring-series edit at the chosen scope. Runs the pure core
 * mutation and reconciles it against the store (upsert vs add, plus removals),
 * then notifies via `onEventUpdate`.
 *
 * `occurrenceStart` MUST be the instance's original start (before the gesture).
 */
export function applyRecurringEdit(store, callbacks, instance, occurrenceStart, patch, scope, timeZone) {
    const mutation = editRecurringEvent({
        event: instance.source,
        occurrenceStart,
        scope,
        patch: { start: patch.start, end: patch.end },
        timeZone,
    });
    const ids = new Set(store.getEvents().map((e) => e.id));
    for (const ev of mutation.update) {
        if (ids.has(ev.id))
            store.updateEvent(ev.id, ev);
        else
            store.addEvent(ev);
    }
    for (const id of mutation.remove)
        store.removeEvent(id);
    callbacks.onEventUpdate?.(instance.eventId, {
        start: patch.start,
        end: patch.end,
    });
}
/**
 * Route a committed gesture to the right path:
 *  - non-recurring → commit directly, return null.
 *  - recurring + host `onRecurringEdit` returns a scope → apply it, return null.
 *  - recurring + no host resolution → return a pending request so the caller
 *    shows the built-in scope picker.
 */
export function routeCommit(store, callbacks, instance, occurrenceStart, patch, timeZone) {
    if (!instance.recurring) {
        commitDirect(store, callbacks, instance.eventId, patch);
        return null;
    }
    const hostScope = callbacks.onRecurringEdit?.({
        instance,
        patch: { start: patch.start, end: patch.end },
        occurrenceStart,
    });
    if (hostScope) {
        applyRecurringEdit(store, callbacks, instance, occurrenceStart, patch, hostScope, timeZone);
        return null;
    }
    return { instance, occurrenceStart, patch };
}
