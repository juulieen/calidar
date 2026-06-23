/**
 * Root calendar component. Accepts either calendar `options` or an existing
 * `store`, wires the host callbacks into context, renders the toolbar and the
 * active view, and provides minimal keyboard navigation.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CalendarOptions,
  CalendarStore,
  ViewModel,
} from "@calidar/core";
import {
  computeView,
  addDays,
  epochToPlainDate,
  startOfDayEpoch,
} from "@calidar/core";
import { useCalendar } from "./useCalendar.js";
import {
  CalendarContext,
  type CalendarCallbacks,
  type CompactNav,
} from "./context.js";
import { CalendarToolbar } from "./CalendarToolbar.js";
import { TimeGridView } from "./TimeGridView.js";
import { MonthView } from "./MonthView.js";
import { InfiniteAgendaView } from "./InfiniteAgendaView.js";

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
  }, [store, snapshot, compactNav]);

  const ctx = useMemo(
    () => ({
      store,
      snapshot,
      effectiveView,
      compactNav,
      stepPeriod,
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
          {view.kind === "month" ? (
            <MonthView model={view} />
          ) : view.kind === "agenda" ? (
            <InfiniteAgendaView />
          ) : (
            <TimeGridView model={view} />
          )}
        </div>
      </div>
    </CalendarContext.Provider>
  );
}
