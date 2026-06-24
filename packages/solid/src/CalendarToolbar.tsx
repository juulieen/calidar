/**
 * Calendar toolbar (Solid port): range title, today/prev/next navigation and a
 * view picker.
 *
 * The view picker maps friendly labels onto `setView` (+ `setVisibleDays` for
 * the "3 days" preset).
 */
import { For, type JSX } from "solid-js";
import { epochToPlainDate, type CalendarViewKind } from "@calidar/core";
import { useCalendarContext } from "./context.js";
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

export function CalendarToolbar(): JSX.Element {
  const { store, snapshot, effectiveView, stepPeriod } = useCalendarContext();

  // Derive the title from what's *actually* rendered. For time grids the
  // effective view model carries each visible day, so a collapsed 3-day window
  // reads "23 – 25 June" rather than the full week.
  const title = (): string => {
    const state = snapshot().state;
    const { view, cursor, timeZone } = state;
    const ev = effectiveView();
    if (ev.kind === "day" || ev.kind === "days" || ev.kind === "week") {
      const days = ev.days;
      const first = days[0]?.date ?? epochToPlainDate(cursor, timeZone);
      // Treat a single rendered day as "day" so the title shows the full date.
      const titleKind = days.length <= 1 ? "day" : ev.kind;
      return formatRangeTitle(titleKind, first, days.length);
    }
    // Month / agenda: derive from state as before.
    const count = ev.kind === "agenda" ? 30 : 0;
    return formatRangeTitle(view, epochToPlainDate(cursor, timeZone), count);
  };

  const isActive = (opt: ViewOption): boolean => {
    const state = snapshot().state;
    return (
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
      </div>
    </div>
  );
}
