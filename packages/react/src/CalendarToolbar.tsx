/**
 * Calendar toolbar: range title, today/prev/next navigation and a view picker.
 *
 * The view picker maps friendly labels onto `setView` (+ `setVisibleDays` for
 * the "3 days" preset).
 */
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

const TIMELINE_UNITS: { label: string; shortLabel: string; unit: TimelineUnit }[] = [
  { label: "Day", shortLabel: "D", unit: "day" },
  { label: "Week", shortLabel: "W", unit: "week" },
  { label: "Month", shortLabel: "M", unit: "month" },
];

export function CalendarToolbar(): JSX.Element {
  const { store, snapshot, effectiveView, stepPeriod, timeline } =
    useCalendarContext();
  const { state } = snapshot;
  const { view, cursor, timeZone, visibleDays } = state;

  // Derive the title from what's *actually* rendered. For time grids the
  // effective view model carries each visible day, so a collapsed 3-day window
  // reads "23 – 25 June" rather than the full week.
  let title: string;
  if (timeline.active) {
    // Timeline title mirrors its unit (day → full date, week/month → range).
    const cursorDate = epochToPlainDate(cursor, timeZone);
    if (timeline.unit === "day") {
      title = formatRangeTitle("day", cursorDate, 1);
    } else if (timeline.unit === "month") {
      title = formatRangeTitle("month", cursorDate, 0);
    } else {
      const first = startOfWeek(cursorDate, state.weekStartsOn);
      title = formatRangeTitle("week", first, 7);
    }
  } else if (
    effectiveView.kind === "day" ||
    effectiveView.kind === "days" ||
    effectiveView.kind === "week"
  ) {
    const days = effectiveView.days;
    const first = days[0]?.date ?? epochToPlainDate(cursor, timeZone);
    // Treat a single rendered day as "day" so the title shows the full date.
    const titleKind = days.length <= 1 ? "day" : effectiveView.kind;
    title = formatRangeTitle(titleKind, first, days.length);
  } else {
    // Month / agenda: derive from state as before.
    const count = effectiveView.kind === "agenda" ? 30 : 0;
    title = formatRangeTitle(view, epochToPlainDate(cursor, timeZone), count);
  }

  const isActive = (opt: ViewOption): boolean =>
    !timeline.active &&
    opt.view === view &&
    (opt.view !== "days" || opt.visibleDays === visibleDays);

  return (
    <div className="cal-toolbar" role="toolbar" aria-label="Calendar controls">
      <div className="cal-toolbar__nav">
        <button type="button" className="cal-btn" onClick={() => store.today()}>
          Today
        </button>
        <button
          type="button"
          className="cal-btn cal-btn--icon"
          aria-label="Previous period"
          onClick={() => stepPeriod(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          className="cal-btn cal-btn--icon"
          aria-label="Next period"
          onClick={() => stepPeriod(1)}
        >
          ›
        </button>
      </div>

      <h2 className="cal-toolbar__title" aria-live="polite">
        {title}
      </h2>

      <div className="cal-toolbar__views" role="group" aria-label="View">
        {VIEW_OPTIONS.map((opt) => (
          <button
            type="button"
            key={opt.label}
            className={`cal-btn cal-btn--view${isActive(opt) ? " cal-btn--active" : ""}`}
            aria-pressed={isActive(opt)}
            aria-label={opt.label}
            onClick={() => {
              // Leaving timeline mode hands control back to the store view.
              timeline.setActive(false);
              if (opt.visibleDays != null) store.setVisibleDays(opt.visibleDays);
              store.setView(opt.view);
            }}
          >
            <span className="cal-btn__label cal-btn__label--full">{opt.label}</span>
            <span className="cal-btn__label cal-btn__label--short" aria-hidden="true">
              {opt.shortLabel}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={`cal-btn cal-btn--view${timeline.active ? " cal-btn--active" : ""}`}
          aria-pressed={timeline.active}
          aria-label="Timeline"
          onClick={() => timeline.setActive(!timeline.active)}
        >
          <span className="cal-btn__label cal-btn__label--full">Timeline</span>
          <span className="cal-btn__label cal-btn__label--short" aria-hidden="true">
            TL
          </span>
        </button>
      </div>

      {/* Timeline axis-granularity sub-selector (only while Timeline is on). */}
      {timeline.active && (
        <div
          className="cal-toolbar__units"
          role="group"
          aria-label="Timeline unit"
        >
          {TIMELINE_UNITS.map((u) => {
            const on = timeline.unit === u.unit;
            return (
              <button
                type="button"
                key={u.unit}
                className={`cal-btn cal-btn--view${on ? " cal-btn--active" : ""}`}
                aria-pressed={on}
                aria-label={`Timeline ${u.label}`}
                onClick={() => timeline.setUnit(u.unit)}
              >
                <span className="cal-btn__label cal-btn__label--full">{u.label}</span>
                <span className="cal-btn__label cal-btn__label--short" aria-hidden="true">
                  {u.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
