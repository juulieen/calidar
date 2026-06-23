import type { CalendarOptions, CalendarStore } from "@calidar/core";
import type { CalendarCallbacks } from "./types.js";
interface Props extends CalendarCallbacks {
    /** Provide options to create a store, or an existing store to share one. */
    options?: CalendarOptions;
    store?: CalendarStore;
    /**
     * Adapt the time grid to narrow containers (phone-style). When the root is
     * under 640px wide and the active view is week/days, the calendar renders a
     * compact 1–3 day window instead of squeezing 7 columns. The store is never
     * mutated, so the full Week view returns when the screen widens. Default
     * `true`; set `false` to keep the legacy fixed layout.
     */
    responsive?: boolean;
}
declare const Calendar: import("svelte").Component<Props, {}, "">;
type Calendar = ReturnType<typeof Calendar>;
export default Calendar;
//# sourceMappingURL=Calendar.svelte.d.ts.map