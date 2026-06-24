/**
   * Infinite, virtualised agenda view.
   *
   * Unlike the static {@link AgendaView} (which renders a precomputed
   * `AgendaViewModel` for a fixed window), this view owns a *dynamic* day range
   * around the cursor and materialises day sections on demand through the core
   * `instancesInWindow` selector. Two things keep it cheap on large datasets:
   *
   *  1. **Bidirectional infinite scroll.** Fixed-pixel sentinels near the top
   *     and bottom of the scroller extend the day range by a chunk (append at
   *     the bottom, prepend at the top). On prepend we compensate `scrollTop` by
   *     the height of the inserted block so the viewport does not jump.
   *
   *  2. **Windowed (virtualised) DOM.** Every day section is measured; sections
   *     outside the viewport (plus a buffer) are replaced by a single spacer of
   *     their measured height, so the number of *mounted* sections stays bounded
   *     while `scrollHeight` keeps growing.
   *
   * The toolbar's ‹ › / Today actions move `store.cursor`; this view watches the
   * cursor (and the time zone / events) and recentres — resetting the range and
   * scrolling to the cursor day.
   */
import type { CalendarSnapshot } from "@calidar/core";
import type { CalendarCallbacks } from "./types.js";
import { type Formatters } from "./format.js";
interface Props {
    snapshot: CalendarSnapshot;
    callbacks: CalendarCallbacks;
    formatters?: Formatters;
}
declare const InfiniteAgendaView: import("svelte").Component<Props, {}, "">;
type InfiniteAgendaView = ReturnType<typeof InfiniteAgendaView>;
export default InfiniteAgendaView;
//# sourceMappingURL=InfiniteAgendaView.svelte.d.ts.map