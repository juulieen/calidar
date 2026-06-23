import type { CalendarStore, CalendarSnapshot, PlainDate } from "@calidar/core";
interface Props {
    store: CalendarStore;
    snapshot: CalendarSnapshot;
    /** Previous-period handler. Defaults to the store's view-sized step. */
    onPrev?: () => void;
    /** Next-period handler. Defaults to the store's view-sized step. */
    onNext?: () => void;
    /**
     * When the parent renders a compact day-window (responsive phone mode),
     * the days actually on screen. The title then reflects this real range
     * instead of the underlying Week state. Null/empty = use the store state.
     */
    titleDays?: PlainDate[] | null;
}
declare const Toolbar: import("svelte").Component<Props, {}, "">;
type Toolbar = ReturnType<typeof Toolbar>;
export default Toolbar;
//# sourceMappingURL=Toolbar.svelte.d.ts.map