/**
 * Locale-aware formatting helpers shared by the views and toolbar.
 *
 * Everything routes through `Intl` with wall-clock dates materialised as UTC
 * `Date`s, so labels stay consistent with the calendar's display zone
 * regardless of the host's locale.
 */
import { addDays, epochToWall } from "@calidar/core";
function locale() {
    if (typeof navigator !== "undefined" && navigator.language) {
        return navigator.language;
    }
    return "en";
}
/** A `Date` whose UTC fields equal the wall-clock value — for `Intl` only. */
function asUtcDate(epoch, timeZone) {
    const w = epochToWall(epoch, timeZone);
    return new Date(Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, w.millisecond));
}
function utcFromPlain(date) {
    return new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
}
/** "09:00" — hour:minute label for events. */
export function formatTime(epoch, timeZone) {
    return new Intl.DateTimeFormat(locale(), {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
    }).format(asUtcDate(epoch, timeZone));
}
/** "9 AM" style hour tick for the time gutter (no minutes). */
export function formatHour(hour) {
    const d = new Date(Date.UTC(2020, 0, 1, hour));
    return new Intl.DateTimeFormat(locale(), {
        hour: "numeric",
        timeZone: "UTC",
    }).format(d);
}
/** "Mon" — short weekday name for a plain date. */
export function formatWeekdayShort(date) {
    return new Intl.DateTimeFormat(locale(), {
        weekday: "short",
        timeZone: "UTC",
    }).format(utcFromPlain(date));
}
/** "Monday 23 June" — long weekday + day for agenda headers. */
export function formatAgendaDay(date) {
    return new Intl.DateTimeFormat(locale(), {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
    }).format(utcFromPlain(date));
}
/** Day-of-month number, e.g. "23". */
export function formatDayNumber(date) {
    return String(date.day);
}
/** "June 2026" — month + year. */
function formatMonthYear(date) {
    return new Intl.DateTimeFormat(locale(), {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(utcFromPlain(date));
}
/** "23 June 2026" — full day. */
function formatFullDay(date) {
    return new Intl.DateTimeFormat(locale(), {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(utcFromPlain(date));
}
function shortMonth(date) {
    return new Intl.DateTimeFormat(locale(), {
        month: "short",
        timeZone: "UTC",
    }).format(utcFromPlain(date));
}
/**
 * Human-readable label for a visible date range, picked to match the active
 * view. `first` is the first visible day; `count` the number of days a time
 * grid covers (ignored for month).
 */
export function formatRangeTitle(view, first, count) {
    if (view === "month")
        return formatMonthYear(first);
    if (view === "day")
        return formatFullDay(first);
    const last = addDays(first, Math.max(0, count - 1));
    if (view === "agenda") {
        return `${formatFullDay(first)} – ${formatFullDay(last)}`;
    }
    if (first.year === last.year && first.month === last.month) {
        return `${first.day} – ${last.day} ${formatMonthYear(first)}`;
    }
    if (first.year === last.year) {
        return `${first.day} ${shortMonth(first)} – ${last.day} ${shortMonth(last)} ${first.year}`;
    }
    return `${formatFullDay(first)} – ${formatFullDay(last)}`;
}
