/**
 * Small, locale-aware formatting helpers shared by the views and toolbar.
 *
 * Everything routes through `Intl` with an explicit `timeZone`, so labels stay
 * consistent with the calendar's display zone regardless of the host's locale.
 */
import {
  type PlainDate,
  addDays,
  epochToWall,
} from "@calidar/core";

/** Resolve the runtime locale (falls back to "en"). */
function locale(): string {
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return "en";
}

/** A `Date` whose UTC fields equal the wall-clock value — for `Intl` only. */
function asUtcDate(epoch: number, timeZone: string): Date {
  const w = epochToWall(epoch, timeZone);
  return new Date(
    Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, w.millisecond),
  );
}

function utcFromPlain(date: PlainDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
}

/** "09:00" — hour label for the gutter / events. */
export function formatTime(epoch: number, timeZone: string): string {
  return new Intl.DateTimeFormat(locale(), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(asUtcDate(epoch, timeZone));
}

/** "9 AM" style hour tick for the time gutter (no minutes). */
export function formatHour(hour: number): string {
  const d = new Date(Date.UTC(2020, 0, 1, hour));
  return new Intl.DateTimeFormat(locale(), {
    hour: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** "Mon" — short weekday name for a plain date. */
export function formatWeekdayShort(date: PlainDate): string {
  return new Intl.DateTimeFormat(locale(), {
    weekday: "short",
    timeZone: "UTC",
  }).format(utcFromPlain(date));
}

/** "Monday 23" — long weekday + day number for agenda headers. */
export function formatAgendaDay(date: PlainDate): string {
  return new Intl.DateTimeFormat(locale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(utcFromPlain(date));
}

/** Day-of-month number, e.g. "23". */
export function formatDayNumber(date: PlainDate): string {
  return String(date.day);
}

/** "June 2026" — month + year. */
export function formatMonthYear(date: PlainDate): string {
  return new Intl.DateTimeFormat(locale(), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcFromPlain(date));
}

/** "23 June 2026" — full day. */
function formatFullDay(date: PlainDate): string {
  return new Intl.DateTimeFormat(locale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcFromPlain(date));
}

/**
 * Human-readable label for a visible date range, picked to match the active
 * view. `first` is the first visible day; `count` the number of days the time
 * grid covers (ignored for month/agenda).
 */
export function formatRangeTitle(
  view: string,
  first: PlainDate,
  count: number,
): string {
  if (view === "month") return formatMonthYear(first);
  if (view === "day") return formatFullDay(first);

  const last = addDays(first, Math.max(0, count - 1));
  if (view === "agenda") {
    return `${formatFullDay(first)} – ${formatFullDay(last)}`;
  }

  // Day-range views (days / week). Compact the shared month/year parts.
  if (first.year === last.year && first.month === last.month) {
    const monthYear = formatMonthYear(first);
    return `${first.day} – ${last.day} ${monthYear}`;
  }
  if (first.year === last.year) {
    return `${first.day} ${shortMonth(first)} – ${last.day} ${shortMonth(last)} ${first.year}`;
  }
  return `${formatFullDay(first)} – ${formatFullDay(last)}`;
}

function shortMonth(date: PlainDate): string {
  return new Intl.DateTimeFormat(locale(), {
    month: "short",
    timeZone: "UTC",
  }).format(utcFromPlain(date));
}
