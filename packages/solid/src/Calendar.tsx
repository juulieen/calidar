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
  type CalendarContextValue,
  type CompactNav,
} from "./context.js";
import { CalendarToolbar } from "./CalendarToolbar.js";
import { TimeGridView } from "./TimeGridView.js";
import { MonthView } from "./MonthView.js";
import { AgendaView } from "./AgendaView.js";

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

  // Step the cursor by one period, honouring the compact day window when the
  // time view has been collapsed (advance N days instead of a whole week).
  const stepPeriod = (dir: 1 | -1): void => {
    const nav = compactNav();
    if (nav) {
      const tz = snapshot().state.timeZone;
      const cursorDate = epochToPlainDate(snapshot().state.cursor, tz);
      const target = addDays(cursorDate, dir * nav.nDays);
      // Place at local midday to dodge DST edges, mirroring the core store.
      store.setCursor(startOfDayEpoch(target, tz) + 12 * 3_600_000);
    } else if (dir < 0) {
      store.prev();
    } else {
      store.next();
    }
  };

  const ctx: CalendarContextValue = {
    store,
    snapshot,
    effectiveView,
    compactNav,
    stepPeriod,
    callbacks,
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
                <AgendaView
                  model={
                    effectiveView() as Extract<ViewModel, { kind: "agenda" }>
                  }
                />
              </Show>
            }
          >
            <MonthView
              model={effectiveView() as Extract<ViewModel, { kind: "month" }>}
            />
          </Show>
        </div>
      </div>
    </CalendarContext.Provider>
  );
}
