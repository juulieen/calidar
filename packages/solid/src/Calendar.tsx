/**
 * Root calendar component (Solid port). Accepts either calendar `options` or an
 * existing `store`, wires the host callbacks into context, renders the toolbar
 * and the active view, and provides minimal keyboard navigation.
 */
import {
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  splitProps,
  type JSX,
} from "solid-js";
import type {
  CalendarOptions,
  CalendarStore,
  ResourceViewModel,
  TimelineViewModel,
  ViewModel,
} from "@calidar/core";
import {
  computeView,
  computeResourceView,
  computeTimelineView,
  addDays,
  addMonths,
  epochToPlainDate,
  startOfDayEpoch,
} from "@calidar/core";
import { useCalendar } from "./useCalendar.js";
import {
  CalendarContext,
  type CalendarCallbacks,
  type CalendarContextValue,
  type CompactNav,
  type TimelineUnit,
} from "./context.js";
import { CalendarToolbar } from "./CalendarToolbar.js";
import { TimeGridView } from "./TimeGridView.js";
import { MonthView } from "./MonthView.js";
import { InfiniteAgendaView } from "./InfiniteAgendaView.js";
import { ResourcesView } from "./ResourcesView.js";
import { TimelineView } from "./TimelineView.js";

export interface CalendarProps extends CalendarCallbacks {
  /** Calendar configuration (used to create a store if `store` is absent). */
  options?: CalendarOptions;
  /** An existing store to drive this calendar (overrides `options`). */
  store?: CalendarStore;
  /** Hide the built-in toolbar (host renders its own controls). */
  hideToolbar?: boolean;
  /**
   * Adapt the time views to narrow (phone) widths: below 640px a Week/N-days
   * view collapses to a compact 1- or 3-day window (Google-Agenda style),
   * without mutating the store. Defaults to `true`; pass `false` to keep the
   * full view at every width.
   */
  responsive?: boolean;
  class?: string;
}

/** Width below which the time views collapse to a compact day window. */
const COMPACT_BREAKPOINT = 640;
/** Width below which the compact window narrows to a single day. */
const SINGLE_DAY_BREAKPOINT = 480;

export function Calendar(props: CalendarProps): JSX.Element {
  const [, callbacks] = splitProps(props, [
    "options",
    "store",
    "hideToolbar",
    "responsive",
    "class",
  ]);
  const responsive = (): boolean => props.responsive ?? true;

  const { store, snapshot } = useCalendar(props.store ?? props.options ?? {});

  let rootRef: HTMLDivElement | undefined;

  // Measure the root width so the time views can collapse on narrow screens.
  // `null` until the first measurement so we never flash the compact layout.
  const [width, setWidth] = createSignal<number | null>(null);
  onMount(() => {
    if (!responsive()) return;
    const el = rootRef;
    if (!el) return;
    const measure = (w: number): void => {
      setWidth((prev) => (prev === w ? prev : w));
    };
    measure(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width);
    });
    ro.observe(el);
    onCleanup(() => ro.disconnect());

    // Roll the "now"-dependent state over when the day changes (cheap interval).
    const id = setInterval(() => store.refresh(), 5 * 60_000);
    onCleanup(() => clearInterval(id));
  });

  // Effective view model + compact navigation descriptor. The store/state are
  // never mutated: we recompute the view from an overridden state copy, so the
  // full Week view automatically returns once the screen widens.
  const computed = createMemo<{
    effectiveView: ViewModel;
    compactNav: CompactNav | null;
  }>(() => {
    const snap = snapshot();
    const { state, view } = snap;
    const w = width();
    const collapsible = view.kind === "week" || view.kind === "days";
    if (
      !responsive() ||
      w === null ||
      w >= COMPACT_BREAKPOINT ||
      !collapsible
    ) {
      return { effectiveView: view, compactNav: null };
    }
    const nDays = w < SINGLE_DAY_BREAKPOINT ? 1 : 3;
    const compactView = computeView(
      { ...state, view: "days", visibleDays: nDays },
      snap.events,
      snap.now,
    );
    return { effectiveView: compactView, compactNav: { nDays } };
  });

  const effectiveView = (): ViewModel => computed().effectiveView;
  const compactNav = (): CompactNav | null => computed().compactNav;

  // Local "resources" mode. This is NOT a store `view` (the resources view is a
  // standalone view model the adapter drives), so we track it in a signal and
  // prioritise it over `snapshot().view` while active. It auto-clears if the
  // calendar ever ends up with no resources to show.
  const [resourceMode, setResourceMode] = createSignal(false);
  const hasResources = (): boolean => snapshot().state.resources.length > 0;
  const resourcesActive = (): boolean => resourceMode() && hasResources();

  // Adapter-LOCAL "Timeline" mode: a horizontal time axis with resources as
  // rows. It never mutates `store.view` — we just render a separate view model
  // when active, exactly like the Resource view does.
  const [timelineActive, setTimelineActive] = createSignal(false);
  const [timelineUnit, setTimelineUnit] = createSignal<TimelineUnit>("day");

  // Resources view model for the focal day, computed only while the mode is
  // active. DST-safe day navigation is handled in `stepPeriod` below.
  const resourceView = createMemo<ResourceViewModel | null>(() => {
    if (!resourcesActive()) return null;
    const snap = snapshot();
    return computeResourceView(snap.state, snap.events, snap.now);
  });

  // The timeline view model, recomputed from the live snapshot when active.
  const timelineView = createMemo<TimelineViewModel | null>(() => {
    if (!timelineActive()) return null;
    const snap = snapshot();
    return computeTimelineView(
      snap.state,
      snap.events,
      { unit: timelineUnit() },
      snap.now,
    );
  });

  // Step the cursor by one period. In resources mode we move one day at a time
  // (the view is single-day); honour the timeline unit / compact day window
  // otherwise; else a whole view step.
  const stepPeriod = (dir: 1 | -1): void => {
    const tz = snapshot().state.timeZone;
    const cursorDate = epochToPlainDate(snapshot().state.cursor, tz);
    if (resourcesActive()) {
      const target = addDays(cursorDate, dir);
      // Place at local midday to dodge DST edges, mirroring the core store.
      store.setCursor(startOfDayEpoch(target, tz) + 12 * 3_600_000);
      return;
    }
    if (timelineActive()) {
      const u = timelineUnit();
      const target =
        u === "day"
          ? addDays(cursorDate, dir)
          : u === "week"
            ? addDays(cursorDate, dir * 7)
            : addMonths(cursorDate, dir);
      store.setCursor(startOfDayEpoch(target, tz) + 12 * 3_600_000);
      return;
    }
    const nav = compactNav();
    if (nav) {
      const target = addDays(cursorDate, dir * nav.nDays);
      store.setCursor(startOfDayEpoch(target, tz) + 12 * 3_600_000);
    } else if (dir < 0) {
      store.prev();
    } else {
      store.next();
    }
  };

  const timeline = {
    active: timelineActive,
    unit: timelineUnit,
    setActive: setTimelineActive,
    setUnit: (unit: TimelineUnit): void => {
      // Selecting an explicit unit also activates the timeline.
      setTimelineUnit(unit);
      setTimelineActive(true);
    },
  };

  const ctx: CalendarContextValue = {
    store,
    snapshot,
    effectiveView,
    compactNav,
    stepPeriod,
    callbacks,
    resourcesActive,
    setResourceMode,
    resourceView,
    timeline,
  };

  // Minimal keyboard navigation: arrows = prev/next period, "t" = today.
  const onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "SELECT" ||
      target.tagName === "TEXTAREA"
    ) {
      return;
    }
    if (e.key === "ArrowLeft") {
      stepPeriod(-1);
    } else if (e.key === "ArrowRight") {
      stepPeriod(1);
    } else if (e.key === "t" || e.key === "T") {
      store.today();
    }
  };

  return (
    <CalendarContext.Provider value={ctx}>
      <div
        ref={rootRef}
        class={`calidar${props.class ? ` ${props.class}` : ""}`}
        tabindex={0}
        onKeyDown={onKeyDown}
        role="application"
        aria-label="Calendar"
      >
        <Show when={!props.hideToolbar}>
          <CalendarToolbar />
        </Show>
        <div class="calidar__view">
          <Show
            when={resourceView()}
            fallback={
              <Show
                when={timelineView()}
                fallback={
                  <Show
                    when={effectiveView().kind === "month"}
                    fallback={
                      <Show
                        when={effectiveView().kind === "agenda"}
                        fallback={
                          <TimeGridView
                            model={
                              effectiveView() as Extract<
                                ViewModel,
                                { kind: "day" | "days" | "week" }
                              >
                            }
                          />
                        }
                      >
                        <InfiniteAgendaView />
                      </Show>
                    }
                  >
                    <MonthView
                      model={
                        effectiveView() as Extract<ViewModel, { kind: "month" }>
                      }
                    />
                  </Show>
                }
              >
                {(model) => (
                  <TimelineView model={model()} now={snapshot().now} />
                )}
              </Show>
            }
          >
            {(model) => <ResourcesView model={model()} />}
          </Show>
        </div>
      </div>
    </CalendarContext.Provider>
  );
}
