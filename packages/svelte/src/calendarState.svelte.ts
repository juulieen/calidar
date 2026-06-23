/**
 * Svelte 5 reactivity bridge for the framework-agnostic `CalendarStore`.
 *
 * Pattern: the store remains the single source of truth. We mirror its memoised
 * snapshot into a rune (`$state`) and keep them in sync with a `$effect` that
 * subscribes once. Because `getSnapshot()` returns a stable reference until
 * something changes, assigning it to `$state` only triggers Svelte updates when
 * the underlying state/events actually change.
 *
 * Consumers read `calendar.snapshot` (a getter backed by the rune) and call
 * actions straight on `calendar.store`.
 */
import {
  createCalendar,
  type CalendarOptions,
  type CalendarSnapshot,
  type CalendarStore,
} from "@calidar/core";

export interface CalendarState {
  readonly store: CalendarStore;
  readonly snapshot: CalendarSnapshot;
}

function isStore(value: CalendarOptions | CalendarStore): value is CalendarStore {
  return (
    typeof (value as CalendarStore).subscribe === "function" &&
    typeof (value as CalendarStore).getSnapshot === "function"
  );
}

/**
 * Create a reactive calendar from either `options` (a store is built lazily) or
 * an existing `store` (lets several components share one calendar).
 *
 * MUST be called during component init (it registers a `$effect`). The returned
 * object exposes a stable `store` and a reactive `snapshot` getter.
 */
export function createCalendarState(
  optionsOrStore: CalendarOptions | CalendarStore = {},
): CalendarState {
  const store: CalendarStore = isStore(optionsOrStore)
    ? optionsOrStore
    : createCalendar(optionsOrStore);

  let snap = $state<CalendarSnapshot>(store.getSnapshot());

  $effect(() => {
    // Re-read on mount in case the store changed between init and effect run.
    snap = store.getSnapshot();
    return store.subscribe(() => {
      snap = store.getSnapshot();
    });
  });

  return {
    store,
    get snapshot() {
      return snap;
    },
  };
}
