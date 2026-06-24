/**
   * Resources view — a per-resource planning grid for the focal day, in the
   * style of Google Calendar "rooms". One column per configured resource, all
   * sharing the same day. Reuses the time-grid DOM / classes (hour gutter,
   * all-day band, absolutely-positioned timed events) so the visual language
   * and scrollbar alignment match the standard views.
   *
   * This is a *local* adapter mode, not a store `view`: the root component
   * drives it and feeds the precomputed `ResourceViewModel` in.
   *
   * Interactions:
   *  - Timed move / resize / create inside a column changes the hour, exactly
   *    like the time grid (shared `GridDragController`).
   *  - Dragging a timed event onto a *different* resource column reassigns its
   *    `resourceId` in addition to any time change. The change is folded into the
   *    commit patch so recurring instances defer it until scope is confirmed.
   */
import type { CalendarStore, ResourceViewModel } from "@calidar/core";
import type { CalendarCallbacks } from "./types.js";
import { type Formatters } from "./format.js";
interface Props {
    store: CalendarStore;
    view: ResourceViewModel;
    now: number;
    callbacks: CalendarCallbacks;
    formatters?: Formatters;
}
declare const ResourcesView: import("svelte").Component<Props, {}, "">;
type ResourcesView = ReturnType<typeof ResourcesView>;
export default ResourcesView;
//# sourceMappingURL=ResourcesView.svelte.d.ts.map