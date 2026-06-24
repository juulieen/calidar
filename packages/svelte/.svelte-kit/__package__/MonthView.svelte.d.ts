import type { CalendarStore, MonthViewModel } from "@calidar/core";
import type { CalendarCallbacks } from "./types.js";
import { type Formatters } from "./format.js";
interface Props {
    store: CalendarStore;
    view: MonthViewModel;
    callbacks: CalendarCallbacks;
    /** Locale-bound formatters (defaults to the runtime locale when omitted). */
    formatters?: Formatters;
}
declare const MonthView: import("svelte").Component<Props, {}, "">;
type MonthView = ReturnType<typeof MonthView>;
export default MonthView;
//# sourceMappingURL=MonthView.svelte.d.ts.map