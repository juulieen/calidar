import type { CalendarStore, MonthViewModel } from "@calidar/core";
import type { CalendarCallbacks } from "./types.js";
interface Props {
    store: CalendarStore;
    view: MonthViewModel;
    callbacks: CalendarCallbacks;
}
declare const MonthView: import("svelte").Component<Props, {}, "">;
type MonthView = ReturnType<typeof MonthView>;
export default MonthView;
//# sourceMappingURL=MonthView.svelte.d.ts.map