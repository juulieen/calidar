import type { CalendarStore, TimeGridViewModel } from "@calidar/core";
import type { CalendarCallbacks } from "./types.js";
interface Props {
    store: CalendarStore;
    view: TimeGridViewModel;
    now: number;
    callbacks: CalendarCallbacks;
}
declare const TimeGridView: import("svelte").Component<Props, {}, "">;
type TimeGridView = ReturnType<typeof TimeGridView>;
export default TimeGridView;
//# sourceMappingURL=TimeGridView.svelte.d.ts.map