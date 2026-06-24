import type { CalendarStore, CalendarSnapshot, PlainDate, ResourceViewModel, TimelineUnit } from "@calidar/core";
import { type Formatters } from "./format.js";
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
    /** Locale-bound formatters (defaults to the runtime locale when omitted). */
    formatters?: Formatters;
    /** True while the Resources mode is active (overrides the store view). */
    resourcesActive?: boolean;
    /** The resources view model while the mode is active, else null. */
    resourceView?: ResourceViewModel | null;
    /** Toggle the Resources mode. */
    onResourceMode?: (on: boolean) => void;
    /** True while the Timeline mode is active. */
    timelineActive?: boolean;
    /** Current Timeline axis unit. */
    timelineUnit?: TimelineUnit;
    /** Toggle the Timeline mode on/off. */
    onTimelineActive?: (on: boolean) => void;
    /** Choose the Timeline axis unit (also activates the mode). */
    onTimelineUnit?: (unit: TimelineUnit) => void;
}
declare const Toolbar: import("svelte").Component<Props, {}, "">;
type Toolbar = ReturnType<typeof Toolbar>;
export default Toolbar;
//# sourceMappingURL=Toolbar.svelte.d.ts.map