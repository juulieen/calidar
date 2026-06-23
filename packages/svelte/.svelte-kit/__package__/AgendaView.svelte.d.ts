import type { AgendaViewModel } from "@calidar/core";
import type { CalendarCallbacks } from "./types.js";
interface Props {
    view: AgendaViewModel;
    now: number;
    callbacks: CalendarCallbacks;
}
declare const AgendaView: import("svelte").Component<Props, {}, "">;
type AgendaView = ReturnType<typeof AgendaView>;
export default AgendaView;
//# sourceMappingURL=AgendaView.svelte.d.ts.map