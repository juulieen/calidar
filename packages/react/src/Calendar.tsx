/**
 * Root calendar component. Accepts either calendar `options` or an existing
 * `store`, wires the host callbacks into context, renders the toolbar and the
 * active view, and provides minimal keyboard navigation.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CalendarOptions,
  CalendarStore,
  TimelineViewModel,
  ViewModel,
} from "@calidar/core";
import {
  computeView,
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
  type CompactNav,
  type TimelineUnit,
} from "./context.js";
import { CalendarToolbar } from "./CalendarToolbar.js";
import { TimeGridView } from "./TimeGridView.js";
import { MonthView } from "./MonthView.js";
import { AgendaView } from "./AgendaView.js";
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
  className?: string;
}

/** Width below which the time views collapse to a compact day window. */
const COMPACT_BREAKPOINT = 640;
/** Width below which the compact window narrows to a single day. */
const SINGLE_DAY_BREAKPOINT = 480;

export function Calendar(props: CalendarProps): JSX.Element {
  const {
    options,
    store: externalStore,
    hideToolbar,
    responsive = true,
    className,
    onEventCreate,
    onEventUpdate,
    onEventClick,
    onSelectSlot,
    onRecurringEdit,
  } = props;

  const { store, snapshot } = useCalendar(externalStore ?? options ?? {});

  const rootRef = useRef<HTMLDivElement>(null);

  // Adapter-LOCAL "Timeline" mode: a horizontal time axis with resources as
  // rows. It never mutates `store.view` — we just render a separate view model
  // when active, exactly like the Resource view does.
  const [timelineActive, setTimelineActive] = useState(false);
  const [timelineUnit, setTimelineUnit] = useState<TimelineUnit>("day");

  // The timeline view model, recomputed from the live snapshot when active.
  const timelineView = useMemo<TimelineViewModel | null>(() => {
    if (!timelineActive) return null;
    return computeTimelineView(
      snapshot.state,
      snapshot.events,
      { unit: timelineUnit },
      snapshot.now,
    );
  }, [timelineActive, timelineUnit, snapshot]);

  // Measure the root width so the time views can collapse on narrow screens.
  // `null` until the first measurement so we never flash the compact layout.
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    if (!responsive) return;
    const el = rootRef.current;
    if (!el) return;
    const measure = (w: number) =>
      setWidth((prev) => (prev === w ? prev : w));
    measure(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [responsive]);

  // Effective view model + compact navigation descriptor. The store/state are
  // never mutated: we recompute the view from an overridden state copy, so the
  // full Week view automatically returns once the screen widens.
  const { effectiveView, compactNav } = useMemo<{
    effectiveView: ViewModel;
    compactNav: CompactNav | null;
  }>(() => {
    const { state, view } = snapshot;
    const collapsible = view.kind === "week" || view.kind === "days";
    if (
      !responsive ||
      width === null ||
      width >= COMPACT_BREAKPOINT ||
      !collapsible
    ) {
      return { effectiveView: view, compactNav: null };
    }
    const nDays = width < SINGLE_DAY_BREAKPOINT ? 1 : 3;
    const compactView = computeView(
      { ...state, view: "days", visibleDays: nDays },
      snapshot.events,
      snapshot.now,
    );
    return { effectiveView: compactView, compactNav: { nDays } };
  }, [responsive, width, snapshot]);

  // Step the cursor by one period, honouring the compact day window when the
  // time view has been collapsed (advance N days instead of a whole week).
  const stepPeriod = useMemo(() => {
    return (dir: 1 | -1): void => {
      if (timelineActive) {
        // Step by the timeline unit (DST-safe: land at local midday).
        const tz = snapshot.state.timeZone;
        const cursorDate = epochToPlainDate(snapshot.state.cursor, tz);
        const target =
          timelineUnit === "day"
            ? addDays(cursorDate, dir)
            : timelineUnit === "week"
              ? addDays(cursorDate, dir * 7)
              : addMonths(cursorDate, dir);
        store.setCursor(startOfDayEpoch(target, tz) + 12 * 3_600_000);
        return;
      }
      if (compactNav) {
        const tz = snapshot.state.timeZone;
        const cursorDate = epochToPlainDate(snapshot.state.cursor, tz);
        const target = addDays(cursorDate, dir * compactNav.nDays);
        // Place at local midday to dodge DST edges, mirroring the core store.
        store.setCursor(startOfDayEpoch(target, tz) + 12 * 3_600_000);
      } else if (dir < 0) {
        store.prev();
      } else {
        store.next();
      }
    };
  }, [store, snapshot, compactNav, timelineActive, timelineUnit]);

  const timeline = useMemo(
    () => ({
      active: timelineActive,
      unit: timelineUnit,
      setActive: setTimelineActive,
      setUnit: (unit: TimelineUnit) => {
        // Selecting an explicit unit also activates the timeline.
        setTimelineUnit(unit);
        setTimelineActive(true);
      },
    }),
    [timelineActive, timelineUnit],
  );

  const ctx = useMemo(
    () => ({
      store,
      snapshot,
      effectiveView,
      compactNav,
      stepPeriod,
      timeline,
      onEventCreate,
      onEventUpdate,
      onEventClick,
      onSelectSlot,
      onRecurringEdit,
    }),
    [
      store,
      snapshot,
      effectiveView,
      compactNav,
      stepPeriod,
      timeline,
      onEventCreate,
      onEventUpdate,
      onEventClick,
      onSelectSlot,
      onRecurringEdit,
    ],
  );

  // Roll the "now"-dependent state over when the day changes (cheap interval).
  useEffect(() => {
    const id = setInterval(() => store.refresh(), 5 * 60_000);
    return () => clearInterval(id);
  }, [store]);

  // Minimal keyboard navigation: arrows = prev/next period, "t" = today.
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") {
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

  const view = effectiveView;

  return (
    <CalendarContext.Provider value={ctx}>
      <div
        ref={rootRef}
        className={`calidar${className ? ` ${className}` : ""}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        role="application"
        aria-label="Calendar"
      >
        {!hideToolbar && <CalendarToolbar />}
        <div className="calidar__view">
          {timelineView ? (
            <TimelineView model={timelineView} now={snapshot.now} />
          ) : view.kind === "month" ? (
            <MonthView model={view} />
          ) : view.kind === "agenda" ? (
            <AgendaView model={view} />
          ) : (
            <TimeGridView model={view} />
          )}
        </div>
      </div>
    </CalendarContext.Provider>
  );
}
