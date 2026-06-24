/**
 * Locale-aware formatting helpers shared by the views and toolbar.
 *
 * Everything routes through `Intl` with wall-clock dates materialised as UTC
 * `Date`s, so labels stay consistent with the calendar's display zone
 * regardless of the host's locale.
 *
 * Formatting is exposed two ways:
 *  - {@link createFormatters} — a factory binding every helper to an explicit
 *    `locale` / `hour12`, used by the adapter to honour the `Calendar` props.
 *  - Standalone `formatX` functions — thin wrappers over a default set bound to
 *    `navigator.language` (and the locale's default hour cycle), preserving the
 *    historical behaviour for direct importers.
 */
import { addDays, epochToWall } from "@calidar/core";
/** Resolve the runtime locale (falls back to "en"). */
function runtimeLocale() {
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
/**
 * Build a set of formatters bound to `locale` / `hour12`.
 *
 * @param locale BCP-47 locale tag. Defaults to `navigator.language`.
 * @param hour12 Force 12h (`true`) or 24h (`false`). When omitted, `Intl`
 *               decides from the locale's default hour cycle (historical
 *               behaviour).
 */
export function createFormatters(locale, hour12) {
    const loc = locale ?? runtimeLocale();
    // Only pass `hour12` to Intl when explicitly set, so the locale default is
    // preserved otherwise (matches the original, unconfigured behaviour).
    const hourCycle = hour12 === undefined ? {} : { hour12 };
    function formatTime(epoch, timeZone) {
        return new Intl.DateTimeFormat(loc, {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
            ...hourCycle,
        }).format(asUtcDate(epoch, timeZone));
    }
    function formatHour(hour) {
        const d = new Date(Date.UTC(2020, 0, 1, hour));
        return new Intl.DateTimeFormat(loc, {
            hour: "numeric",
            timeZone: "UTC",
            ...hourCycle,
        }).format(d);
    }
    function formatWeekdayShort(date) {
        return new Intl.DateTimeFormat(loc, {
            weekday: "short",
            timeZone: "UTC",
        }).format(utcFromPlain(date));
    }
    function formatAgendaDay(date) {
        return new Intl.DateTimeFormat(loc, {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
        }).format(utcFromPlain(date));
    }
    function formatDayNumber(date) {
        return String(date.day);
    }
    function formatMonthYear(date) {
        return new Intl.DateTimeFormat(loc, {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        }).format(utcFromPlain(date));
    }
    function formatFullDay(date) {
        return new Intl.DateTimeFormat(loc, {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        }).format(utcFromPlain(date));
    }
    function shortMonth(date) {
        return new Intl.DateTimeFormat(loc, {
            month: "short",
            timeZone: "UTC",
        }).format(utcFromPlain(date));
    }
    function formatRangeTitle(view, first, count) {
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
    return {
        formatTime,
        formatHour,
        formatWeekdayShort,
        formatAgendaDay,
        formatDayNumber,
        formatRangeTitle,
    };
}
/**
 * Default formatters bound to the runtime locale with the locale's own hour
 * cycle — backing the standalone exports below for unchanged default output.
 */
const defaultFormatters = createFormatters();
/** "09:00" — hour:minute label for events. */
export function formatTime(epoch, timeZone) {
    return defaultFormatters.formatTime(epoch, timeZone);
}
/** "9 AM" style hour tick for the time gutter (no minutes). */
export function formatHour(hour) {
    return defaultFormatters.formatHour(hour);
}
/** "Mon" — short weekday name for a plain date. */
export function formatWeekdayShort(date) {
    return defaultFormatters.formatWeekdayShort(date);
}
/** "Monday 23 June" — long weekday + day for agenda headers. */
export function formatAgendaDay(date) {
    return defaultFormatters.formatAgendaDay(date);
}
/** Day-of-month number, e.g. "23". */
export function formatDayNumber(date) {
    return defaultFormatters.formatDayNumber(date);
}
/** "June 2026" — month + year. */
export function formatMonthYear(date) {
    return new Intl.DateTimeFormat(runtimeLocale(), {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(utcFromPlain(date));
}
/**
 * Human-readable label for a visible date range, picked to match the active
 * view. `first` is the first visible day; `count` the number of days a time
 * grid covers (ignored for month).
 */
export function formatRangeTitle(view, first, count) {
    return defaultFormatters.formatRangeTitle(view, first, count);
}
/**
 * Axis tick label for the Timeline view. Day unit → hour ("09:00"); week →
 * short weekday + day number ("Mon 23"); month → day number ("23"). Routed
 * through `Intl` with the calendar's display time zone.
 */
export function timelineTickLabel(epoch, unit, timeZone) {
    if (unit === "day")
        return formatTime(epoch, timeZone);
    const opts = unit === "week"
        ? { weekday: "short", day: "numeric", timeZone: "UTC" }
        : { day: "numeric", timeZone: "UTC" };
    return new Intl.DateTimeFormat(runtimeLocale(), opts).format(asUtcDate(epoch, timeZone));
}
