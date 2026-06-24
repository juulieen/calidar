import type { CalendarStore, TimeGridViewModel } from "@calidar/core";
import type { CalendarCallbacks } from "./types.js";
import { type Formatters } from "./format.js";
interface Props {
    store: CalendarStore;
    view: TimeGridViewModel;
    now: number;
    callbacks: CalendarCallbacks;
    /** Locale-bound formatters (defaults to the runtime locale when omitted). */
    formatters?: Formatters;
}
declare const TimeGridView: import("svelte").Component<Props, {}, "">;
type TimeGridView = ReturnType<typeof TimeGridView>;
export default TimeGridView;
//# sourceMappingURL=TimeGridView.svelte.d.ts.map