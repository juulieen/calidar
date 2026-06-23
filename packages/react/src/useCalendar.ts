/**
 * `useCalendar` — bind a `CalendarStore` to React via `useSyncExternalStore`.
 *
 * The store is created once (kept in a ref) so navigation/mutation actions
 * stay referentially stable across renders. A pre-built store may also be
 * passed in, which lets several components share the same calendar.
 */
import { useRef } from "react";
import { useSyncExternalStore } from "react";
import {
  createCalendar,
  type CalendarOptions,
  type CalendarSnapshot,
  type CalendarStore,
} from "@calidar/core";

export interface UseCalendarResult {
  store: CalendarStore;
  snapshot: CalendarSnapshot;
}

/**
 * Accepts either calendar `options` (a store is created lazily) or an existing
 * `store`. Returns the live `store` plus its current memoised `snapshot`.
 */
export function useCalendar(
  optionsOrStore: CalendarOptions | CalendarStore = {},
): UseCalendarResult {
  // Resolve the store exactly once. We never swap stores after mount: passing a
  // different `options` object on re-render is intentionally ignored (use the
  // store actions to mutate state instead).
  const ref = useRef<CalendarStore | null>(null);
  if (ref.current === null) {
    ref.current = isStore(optionsOrStore)
      ? optionsOrStore
      : createCalendar(optionsOrStore);
  }
  const store = ref.current;

  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  return { store, snapshot };
}

function isStore(value: CalendarOptions | CalendarStore): value is CalendarStore {
  return (
    typeof (value as CalendarStore).subscribe === "function" &&
    typeof (value as CalendarStore).getSnapshot === "function"
  );
}
