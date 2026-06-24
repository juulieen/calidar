/**
 * `useCalendar` — bind a `CalendarStore` to Vue reactivity.
 *
 * The store is created exactly once (a different `options` object on re-call is
 * intentionally ignored: mutate via the store actions instead). A pre-built
 * store may also be passed in, which lets several components share the same
 * calendar.
 *
 * Reactivity pattern: `store.getSnapshot()` returns a *stable* reference until
 * state/events change, so we mirror it in a `shallowRef` and only reassign on
 * subscription notifications — re-render happens solely on real change.
 */
import { onMounted, onScopeDispose, shallowRef, type Ref } from "vue";
import {
  createCalendar,
  type CalendarOptions,
  type CalendarSnapshot,
  type CalendarStore,
} from "@calidar/core";

export interface UseCalendarResult {
  store: CalendarStore;
  snapshot: Ref<CalendarSnapshot>;
}

/**
 * Accepts either calendar `options` (a store is created lazily) or an existing
 * `store`. Returns the live `store` plus a reactive `snapshot` ref.
 */
export function useCalendar(
  optionsOrStore: CalendarOptions | CalendarStore = {},
): UseCalendarResult {
  const store: CalendarStore = isStore(optionsOrStore)
    ? optionsOrStore
    : createCalendar(optionsOrStore);

  const snapshot = shallowRef<CalendarSnapshot>(store.getSnapshot());

  // Start the subscription immediately in setup() to avoid missing store
  // updates between setup and onMounted. Clean up when the scope disposes.
  const unsub = store.subscribe(() => {
    snapshot.value = store.getSnapshot();
  });
  onScopeDispose(unsub);

  onMounted(() => {
    // Re-sync once on mount in case the store mutated between setup and mount.
    snapshot.value = store.getSnapshot();
  });

  return { store, snapshot };
}

function isStore(
  value: CalendarOptions | CalendarStore,
): value is CalendarStore {
  return (
    typeof (value as CalendarStore).subscribe === "function" &&
    typeof (value as CalendarStore).getSnapshot === "function"
  );
}
