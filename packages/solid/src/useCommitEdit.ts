/**
 * Shared commit logic for a drag/resize that lands on an existing event
 * (Solid port).
 *
 * - Non-recurring instance → patch the store directly + fire `onEventUpdate`.
 * - Recurring instance → defer: surface a pending edit so the view can render
 *   the scope popover, then apply `editRecurringEvent`'s pure result once the
 *   user picks a scope.
 *
 * The host can intercept via `onRecurringEdit`; otherwise the built-in store
 * mutation runs.
 */
import { createSignal, type Accessor } from "solid-js";
import {
  editRecurringEvent,
  type CalendarEvent,
  type EventInstance,
} from "@calidar/core";
import { useCalendarContext } from "./context.js";
import type { RecurrenceEditScope } from "./context.js";

/** Patch applied by a finished gesture: new times, optionally a new resource. */
export interface EditPatch {
  start: number;
  end: number;
  /** Reassigned resource when a gesture lands on another column/row. */
  resourceId?: string;
}

/** A move/resize result awaiting a scope choice. */
export interface PendingRecurringEdit {
  instance: EventInstance;
  /** Original occurrence start, before the gesture. */
  occurrenceStart: number;
  patch: EditPatch;
}

export interface CommitEditApi {
  /** The edit waiting for a scope choice, or null. */
  pending: Accessor<PendingRecurringEdit | null>;
  /**
   * Commit a finished gesture. For a recurring instance this opens the scope
   * popover instead of mutating immediately.
   */
  commit: (instance: EventInstance, patch: EditPatch) => void;
  /** Apply a chosen scope to the pending recurring edit. */
  resolve: (scope: RecurrenceEditScope) => void;
  /** Discard the pending edit (cancel / revert). */
  cancel: () => void;
}

export function useCommitEdit(): CommitEditApi {
  const { store, snapshot, callbacks } = useCalendarContext();
  const [pending, setPending] = createSignal<PendingRecurringEdit | null>(null);

  const commit = (instance: EventInstance, patch: EditPatch): void => {
    if (instance.recurring) {
      setPending({ instance, occurrenceStart: instance.start, patch });
      return;
    }
    const storePatch: Partial<CalendarEvent> = {
      start: patch.start,
      end: patch.end,
      ...(patch.resourceId != null ? { resourceId: patch.resourceId } : {}),
    };
    store.updateEvent(instance.eventId, storePatch);
    callbacks.onEventUpdate?.(instance.eventId, storePatch);
  };

  const resolve = (scope: RecurrenceEditScope): void => {
    const p = pending();
    if (!p) return;
    const { instance, occurrenceStart, patch } = p;
    setPending(null);

    // The recurrence editor handles only the time change; a resource
    // reassignment is folded into the resulting series events afterwards.
    const timePatch = { start: patch.start, end: patch.end };
    const handled = callbacks.onRecurringEdit?.({
      instance,
      occurrenceStart,
      patch: timePatch,
      scope,
    });
    if (!handled) {
      const mutation = editRecurringEvent({
        event: instance.source,
        occurrenceStart,
        scope,
        patch: timePatch,
        timeZone: snapshot().state.timeZone,
      });
      const ids = new Set(store.getEvents().map((e) => e.id));
      for (const ev of mutation.update) {
        const next =
          patch.resourceId != null ? { ...ev, resourceId: patch.resourceId } : ev;
        if (ids.has(ev.id)) store.updateEvent(ev.id, next);
        else store.addEvent(next);
      }
      for (const id of mutation.remove) store.removeEvent(id);
    }
    callbacks.onEventUpdate?.(instance.eventId, timePatch);
  };

  const cancel = (): void => {
    setPending(null);
  };

  return { pending, commit, resolve, cancel };
}
