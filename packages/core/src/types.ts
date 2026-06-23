/**
 * Public data model for the calendar engine. These types are the stable
 * contract that framework adapters (React, Svelte, ...) build upon.
 */

/** The supported calendar view kinds. */
export type CalendarViewKind = "day" | "days" | "week" | "month" | "agenda";

/**
 * An event as supplied by the host application. Times are ISO 8601 strings
 * or epoch milliseconds; the engine normalises them against a time zone.
 *
 * Recurrence follows RFC 5545: a single `rrule` string plus optional
 * `exdates` (excluded instances) describes a whole series.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  /** Inclusive start. ISO string ("2026-06-23T09:00:00") or epoch ms. */
  start: string | number;
  /** Exclusive end. ISO string or epoch ms. */
  end: string | number;
  /** All-day events ignore the time-of-day and span whole calendar days. */
  allDay?: boolean;
  /**
   * IANA time zone the start/end are expressed in. Defaults to the calendar's
   * display zone when omitted.
   */
  timeZone?: string;
  /** RFC 5545 RRULE, e.g. "FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=1". */
  rrule?: string;
  /** ISO date-times excluded from the recurrence expansion. */
  exdates?: (string | number)[];
  /**
   * RFC 5545 RDATE — extra occurrence start times added to the set, on top of
   * the master/RRULE occurrences (ISO strings or epoch ms). EXDATE wins.
   */
  rdates?: (string | number)[];
  /** Arbitrary host data, carried through untouched. */
  meta?: Record<string, unknown>;
  /** Optional display hints; adapters/themes may use these. */
  color?: string;
  editable?: boolean;
}

/**
 * A concrete, laid-out occurrence of an event within a view's date window.
 * Recurring events expand into multiple instances sharing `eventId`.
 */
export interface EventInstance {
  /** Stable per-occurrence key: `${eventId}` or `${eventId}@${startEpoch}`. */
  key: string;
  eventId: string;
  title: string;
  /** Absolute start instant (epoch ms, UTC). */
  start: number;
  /** Absolute end instant (epoch ms, UTC). */
  end: number;
  allDay: boolean;
  /** True when this instance came from a recurrence expansion. */
  recurring: boolean;
  color?: string;
  editable: boolean;
  source: CalendarEvent;
}

/** Geometry for a timed instance within a single day column. */
export interface TimedLayout {
  instance: EventInstance;
  /** Fractional offset from the top of the day, 0..1. */
  top: number;
  /** Fractional height, 0..1. */
  height: number;
  /** Column index within an overlap cluster. */
  column: number;
  /** Total columns in this instance's overlap cluster. */
  columns: number;
  /** Fractional left position 0..1 (column / columns, before widening). */
  left: number;
  /** Fractional width 0..1. */
  width: number;
}

/** A row-packed multi-day band within a month/all-day grid. */
export interface DayBand {
  instance: EventInstance;
  /** First visible day column index (0-based within the row). */
  startCol: number;
  /** Inclusive last visible day column index within the row. */
  endCol: number;
  /** Vertical lane assigned to avoid overlap with sibling bands. */
  lane: number;
  /** True when the event actually begins before this row's first column. */
  continuesBefore: boolean;
  /** True when the event actually ends after this row's last column. */
  continuesAfter: boolean;
}

/** Calendar engine configuration / current state snapshot. */
export interface CalendarState {
  view: CalendarViewKind;
  /** The focal date the view is centred on (epoch ms within the day). */
  cursor: number;
  /** IANA display time zone for the whole calendar. */
  timeZone: string;
  /** 1 = Monday ... 7 = Sunday. */
  weekStartsOn: number;
  /** For the "days" view: how many consecutive days to show. */
  visibleDays: number;
  /** Pixels per hour for timed grids — adapters may override at render time. */
  hourHeight: number;
}

/** Inclusive-exclusive instant interval, in epoch milliseconds. */
export interface EpochRange {
  start: number;
  end: number;
}
