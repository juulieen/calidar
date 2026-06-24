/**
 * Calendar toolbar (Solid port): range title, today/prev/next navigation and a
 * view picker.
 *
 * The view picker maps friendly labels onto `setView` (+ `setVisibleDays` for
 * the "3 days" preset).
 */
import { For, Show, type JSX } from "solid-js";
import {
  epochToPlainDate,
  startOfWeek,
  type CalendarViewKind,
} from "@calidar/core";
import { useCalendarContext, type TimelineUnit } from "./context.js";
import { formatRangeTitle } from "./format.js";

interface ViewOption {
  label: string;
  /** Compact label used when the toolbar is space-constrained (phones). */
  shortLabel: string;
  view: CalendarViewKind;
  visibleDays?: number;
}

const VIEW_OPTIONS: ViewOption[] = [
  { label: "Day", shortLabel: "1d", view: "day" },
  { label: "3 days", shortLabel: "3d", view: "days", visibleDays: 3 },
  { label: "Week", shortLabel: "Wk", view: "week" },
  { label: "Month", shortLabel: "Mo", view: "month" },
  { label: "Agenda", shortLabel: "List", view: "agenda" },
];

const TIMELINE_UNITS: { label: string; shortLabel: string; unit: TimelineUnit }[] =
  [
    { label: "Day", shortLabel: "D", unit: "day" },
    { label: "Week", shortLabel: "W", unit: "week" },
    { label: "Month", shortLabel: "M", unit: "month" },
  ];

export function CalendarToolbar(): JSX.Element {
  const {
    store,
    snapshot,
    effectiveView,
    stepPeriod,
    resourcesActive,
    setResourceMode,
    resourceView,
    timeline,
  } = useCalendarContext();

  const hasResources = (): boolean => snapshot().state.resources.length > 0;

  // Derive the title from what's *actually* rendered. For time grids the
  // effective view model carries each visible day, so a collapsed 3-day window
  // reads "23 – 25 June" rather than the full week.
  const title = (): string => {
    const state = snapshot().state;
    const { view, cursor, timeZone } = state;
    const rv = resourceView();
    if (rv) {
      // Resources mode navigates one day at a time; show that day's full date.
      return formatRangeTitle("day", rv.date, 1);
    }
    if (timeline.active()) {
      // Timeline title mirrors its unit (day → full date, week/month → range).
      const cursorDate = epochToPlainDate(cursor, timeZone);
      if (timeline.unit() === "day") {
        return formatRangeTitle("day", cursorDate, 1);
      }
      if (timeline.unit() === "month") {
        return formatRangeTitle("month", cursorDate, 0);
      }
      const first = startOfWeek(cursorDate, state.weekStartsOn);
      return formatRangeTitle("week", first, 7);
    }
    const ev = effectiveView();
    if (ev.kind === "day" || ev.kind === "days" || ev.kind === "week") {
      const days = ev.days;
      const first = days[0]?.date ?? epochToPlainDate(cursor, timeZone);
      // Treat a single rendered day as "day" so the title shows the full date.
      const titleKind = days.length <= 1 ? "day" : ev.kind;
      return formatRangeTitle(titleKind, first, days.length);
    }
    if (ev.kind === "agenda") {
      // The infinite agenda is centred on the cursor; label it by the cursor's
      // month so ‹ › / Today read sensibly as the view recentres.
      return formatRangeTitle("month", epochToPlainDate(cursor, timeZone), 0);
    }
    // Month: derive from state as before.
    return formatRangeTitle(view, epochToPlainDate(cursor, timeZone), 0);
  };

  const isActive = (opt: ViewOption): boolean => {
    const state = snapshot().state;
    return (
      !resourcesActive() &&
      !timeline.active() &&
      opt.view === state.view &&
      (opt.view !== "days" || opt.visibleDays === state.visibleDays)
    );
  };

  return (
    <div class="cal-toolbar" role="toolbar" aria-label="Calendar controls">
      <div class="cal-toolbar__nav">
        <button type="button" class="cal-btn" onClick={() => store.today()}>
          Today
        </button>
        <button
          type="button"
          class="cal-btn cal-btn--icon"
          aria-label="Previous period"
          onClick={() => stepPeriod(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          class="cal-btn cal-btn--icon"
          aria-label="Next period"
          onClick={() => stepPeriod(1)}
        >
          ›
        </button>
      </div>

      <h2 class="cal-toolbar__title" aria-live="polite">
        {title()}
      </h2>

      <div class="cal-toolbar__views" role="group" aria-label="View">
        <For each={VIEW_OPTIONS}>
          {(opt) => (
            <button
              type="button"
              class="cal-btn cal-btn--view"
              classList={{ "cal-btn--active": isActive(opt) }}
              aria-pressed={isActive(opt)}
              aria-label={opt.label}
              onClick={() => {
                // Leaving a local mode hands control back to the store view.
                setResourceMode(false);
                timeline.setActive(false);
                if (opt.visibleDays != null) store.setVisibleDays(opt.visibleDays);
                store.setView(opt.view);
              }}
            >
              <span class="cal-btn__label cal-btn__label--full">{opt.label}</span>
              <span
                class="cal-btn__label cal-btn__label--short"
                aria-hidden="true"
              >
                {opt.shortLabel}
              </span>
            </button>
          )}
        </For>

        <Show when={hasResources()}>
          <button
            type="button"
            class="cal-btn cal-btn--view"
            classList={{ "cal-btn--active": resourcesActive() }}
            aria-pressed={resourcesActive()}
            aria-label="Resources"
            onClick={() => {
              timeline.setActive(false);
              setResourceMode(true);
            }}
          >
            <span class="cal-btn__label cal-btn__label--full">Resources</span>
            <span class="cal-btn__label cal-btn__label--short" aria-hidden="true">
              Res
            </span>
          </button>
        </Show>

        <button
          type="button"
          class="cal-btn cal-btn--view"
          classList={{ "cal-btn--active": timeline.active() }}
          aria-pressed={timeline.active()}
          aria-label="Timeline"
          onClick={() => {
            setResourceMode(false);
            timeline.setActive(!timeline.active());
          }}
        >
          <span class="cal-btn__label cal-btn__label--full">Timeline</span>
          <span class="cal-btn__label cal-btn__label--short" aria-hidden="true">
            TL
          </span>
        </button>
      </div>

      {/* Timeline axis-granularity sub-selector (only while Timeline is on). */}
      <Show when={timeline.active()}>
        <div class="cal-toolbar__units" role="group" aria-label="Timeline unit">
          <For each={TIMELINE_UNITS}>
            {(u) => {
              const on = (): boolean => timeline.unit() === u.unit;
              return (
                <button
                  type="button"
                  class="cal-btn cal-btn--view"
                  classList={{ "cal-btn--active": on() }}
                  aria-pressed={on()}
                  aria-label={`Timeline ${u.label}`}
                  onClick={() => timeline.setUnit(u.unit)}
                >
                  <span class="cal-btn__label cal-btn__label--full">
                    {u.label}
                  </span>
                  <span
                    class="cal-btn__label cal-btn__label--short"
                    aria-hidden="true"
                  >
                    {u.shortLabel}
                  </span>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
