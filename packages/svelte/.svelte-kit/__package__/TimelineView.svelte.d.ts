/**
   * Timeline view: resources as rows, a HORIZONTAL time axis.
   *
   * A frozen left column lists the resources (colour pip + name), or a single
   * "All events" row when no resources are configured. To its right a
   * horizontally scrollable lane holds a time axis (graduations from the model's
   * `slots`), vertical gridlines, and — per resource row — the event bars
   * positioned from the fractional `left`/`width` geometry the core selector
   * produced. Overlapping bars stack by `lane`; a "now" marker tracks the
   * current instant.
   *
   * Timeline is an adapter-LOCAL mode: it renders `computeTimelineView(...)`
   * without ever mutating `store.view`, exactly like the Resources view.
   *
   * Interactions (pointer): drag a bar horizontally to move it in time, drag the
   * left/right edge to resize, and drag vertically onto another resource row to
   * reassign `resourceId`. Pixel→time mapping snaps to 15-minute steps. Locked
   * (`editable === false`) bars are inert. Recurring instances defer to the
   * scope popover via the shared commit logic.
   */
import type { CalendarStore, TimelineViewModel } from "@calidar/core";
import type { CalendarCallbacks } from "./types.js";
import { type Formatters } from "./format.js";
interface Props {
    store: CalendarStore;
    view: TimelineViewModel;
    now: number;
    callbacks: CalendarCallbacks;
    formatters?: Formatters;
}
declare const TimelineView: import("svelte").Component<Props, {}, "">;
type TimelineView = ReturnType<typeof TimelineView>;
export default TimelineView;
//# sourceMappingURL=TimelineView.svelte.d.ts.map