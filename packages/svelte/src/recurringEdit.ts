/**
 * Shared logic for committing a move/resize that landed on an event instance.
 *
 * Non-recurring instances commit directly (patch the master). Recurring
 * instances need the user's scope choice ("this" / "thisAndFollowing" / "all"),
 * after which we run the core's pure `editRecurringEvent` and apply the
 * resulting upserts/removals to the store.
 */
import {
  editRecurringEvent,
  type CalendarEvent,
  type CalendarStore,
  type EventInstance,
} from "@calidar/core";
import type { CalendarCallbacks, RecurringEditScope } from "./types.js";

/** Bounds produced by a gesture. */
export interface EditBounds {
  start: number;
  end: number;
}

/**
 * Optional extra event fields folded into a commit alongside the time bounds —
 * used by the Resources / Timeline views to reassign `resourceId` when a drag
 * lands on a different column / row.
 */
export type ExtraPatch = Partial<Pick<CalendarEvent, "resourceId">>;

/**
 * Commit a plain (non-recurring) move/resize: patch the master event and notify.
 * `extra` carries any non-time fields (e.g. a reassigned `resourceId`).
 */
export function commitDirect(
  store: CalendarStore,
  callbacks: CalendarCallbacks,
  eventId: string,
  patch: EditBounds,
  extra: ExtraPatch = {},
): void {
  const full = { start: patch.start, end: patch.end, ...extra };
  store.updateEvent(eventId, full);
  callbacks.onEventUpdate?.(eventId, { start: patch.start, end: patch.end });
}

/**
 * Apply a recurring-series edit at the chosen scope. Runs the pure core
 * mutation and reconciles it against the store (upsert vs add, plus removals),
 * then notifies via `onEventUpdate`.
 *
 * `occurrenceStart` MUST be the instance's original start (before the gesture).
 */
export function applyRecurringEdit(
  store: CalendarStore,
  callbacks: CalendarCallbacks,
  instance: EventInstance,
  occurrenceStart: number,
  patch: EditBounds,
  scope: RecurringEditScope,
  timeZone: string,
  extra: ExtraPatch = {},
): void {
  const mutation = editRecurringEvent({
    event: instance.source,
    occurrenceStart,
    scope,
    patch: { start: patch.start, end: patch.end, ...extra },
    timeZone,
  });

  const ids = new Set(store.getEvents().map((e) => e.id));
  for (const ev of mutation.update) {
    if (ids.has(ev.id)) store.updateEvent(ev.id, ev);
    else store.addEvent(ev);
  }
  for (const id of mutation.remove) store.removeEvent(id);

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
export function routeCommit(
  store: CalendarStore,
  callbacks: CalendarCallbacks,
  instance: EventInstance,
  occurrenceStart: number,
  patch: EditBounds,
  timeZone: string,
  extra: ExtraPatch = {},
): {
  instance: EventInstance;
  occurrenceStart: number;
  patch: EditBounds;
  extra: ExtraPatch;
} | null {
  if (!instance.recurring) {
    commitDirect(store, callbacks, instance.eventId, patch, extra);
    return null;
  }
  const hostScope = callbacks.onRecurringEdit?.({
    instance,
    patch: { start: patch.start, end: patch.end },
    occurrenceStart,
  });
  if (hostScope) {
    applyRecurringEdit(
      store,
      callbacks,
      instance,
      occurrenceStart,
      patch,
      hostScope,
      timeZone,
      extra,
    );
    return null;
  }
  return { instance, occurrenceStart, patch, extra };
}
