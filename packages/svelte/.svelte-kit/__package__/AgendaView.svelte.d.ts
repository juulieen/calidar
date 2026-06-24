import type { AgendaViewModel } from "@calidar/core";
import type { CalendarCallbacks } from "./types.js";
import { type Formatters } from "./format.js";
interface Props {
    view: AgendaViewModel;
    now: number;
    callbacks: CalendarCallbacks;
    /** Locale-bound formatters (defaults to the runtime locale when omitted). */
    formatters?: Formatters;
}
declare const AgendaView: import("svelte").Component<Props, {}, "">;
type AgendaView = ReturnType<typeof AgendaView>;
export default AgendaView;
//# sourceMappingURL=AgendaView.svelte.d.ts.map