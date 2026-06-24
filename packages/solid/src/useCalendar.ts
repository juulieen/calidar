/**
 * `useCalendar` — bind a `CalendarStore` to Solid via a signal driven by the
 * store's `subscribe`/`getSnapshot` pair.
 *
 * The store is created exactly once (a pre-built store may also be passed in,
 * which lets several components share the same calendar). `getSnapshot()`
 * returns a stable, memoised reference until state/events change, so Solid's
 * `===` comparison only fires the signal when something actually changed.
 */
import { createSignal, onCleanup, onMount, type Accessor } from "solid-js";
import {
  createCalendar,
  type CalendarOptions,
  type CalendarSnapshot,
  type CalendarStore,
} from "@calidar/core";

export interface UseCalendarResult {
  store: CalendarStore;
  snapshot: Accessor<CalendarSnapshot>;
}

/**
 * Accepts either calendar `options` (a store is created lazily) or an existing
 * `store`. Returns the live `store` plus a reactive `snapshot` accessor.
 */
export function useCalendar(
  optionsOrStore: CalendarOptions | CalendarStore = {},
): UseCalendarResult {
  // Resolve the store exactly once. We never swap stores after creation.
  const store = isStore(optionsOrStore)
    ? optionsOrStore
    : createCalendar(optionsOrStore);

  const [snapshot, setSnapshot] = createSignal<CalendarSnapshot>(
    store.getSnapshot(),
  );

  onMount(() => {
    // Re-sync once on mount in case state changed between creation and mount.
    setSnapshot(store.getSnapshot());
    const unsub = store.subscribe(() => setSnapshot(store.getSnapshot()));
    onCleanup(unsub);
  });

  return { store, snapshot };
}

function isStore(value: CalendarOptions | CalendarStore): value is CalendarStore {
  return (
    typeof (value as CalendarStore).subscribe === "function" &&
    typeof (value as CalendarStore).getSnapshot === "function"
  );
}
