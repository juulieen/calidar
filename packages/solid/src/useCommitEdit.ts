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
import { editRecurringEvent, type EventInstance } from "@calidar/core";
import { useCalendarContext } from "./context.js";
import type { RecurrenceEditScope } from "./context.js";

/** A move/resize result awaiting a scope choice. */
export interface PendingRecurringEdit {
  instance: EventInstance;
  /** Original occurrence start, before the gesture. */
  occurrenceStart: number;
  patch: { start: number; end: number };
}

export interface CommitEditApi {
  /** The edit waiting for a scope choice, or null. */
  pending: Accessor<PendingRecurringEdit | null>;
  /**
   * Commit a finished gesture. For a recurring instance this opens the scope
   * popover instead of mutating immediately.
   */
  commit: (instance: EventInstance, patch: { start: number; end: number }) => void;
  /** Apply a chosen scope to the pending recurring edit. */
  resolve: (scope: RecurrenceEditScope) => void;
  /** Discard the pending edit (cancel / revert). */
  cancel: () => void;
}

export function useCommitEdit(): CommitEditApi {
  const { store, snapshot, callbacks } = useCalendarContext();
  const [pending, setPending] = createSignal<PendingRecurringEdit | null>(null);

  const commit = (
    instance: EventInstance,
    patch: { start: number; end: number },
  ): void => {
    if (instance.recurring) {
      setPending({ instance, occurrenceStart: instance.start, patch });
      return;
    }
    store.updateEvent(instance.eventId, patch);
    callbacks.onEventUpdate?.(instance.eventId, patch);
  };

  const resolve = (scope: RecurrenceEditScope): void => {
    const p = pending();
    if (!p) return;
    const { instance, occurrenceStart, patch } = p;
    setPending(null);

    const handled = callbacks.onRecurringEdit?.({
      instance,
      occurrenceStart,
      patch,
      scope,
    });
    if (!handled) {
      const mutation = editRecurringEvent({
        event: instance.source,
        occurrenceStart,
        scope,
        patch,
        timeZone: snapshot().state.timeZone,
      });
      const ids = new Set(store.getEvents().map((e) => e.id));
      for (const ev of mutation.update) {
        if (ids.has(ev.id)) store.updateEvent(ev.id, ev);
        else store.addEvent(ev);
      }
      for (const id of mutation.remove) store.removeEvent(id);
    }
    callbacks.onEventUpdate?.(instance.eventId, patch);
  };

  const cancel = (): void => {
    setPending(null);
  };

  return { pending, commit, resolve, cancel };
}
