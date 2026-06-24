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
import { type PlainDate } from "@calidar/core";
/** Locale-bound formatting helpers, produced by {@link createFormatters}. */
export interface Formatters {
    /** "09:00" — hour:minute label for events. */
    formatTime(epoch: number, timeZone: string): string;
    /** "9 AM" style hour tick for the time gutter (no minutes). */
    formatHour(hour: number): string;
    /** "Mon" — short weekday name for a plain date. */
    formatWeekdayShort(date: PlainDate): string;
    /** "Monday 23 June" — long weekday + day for agenda headers. */
    formatAgendaDay(date: PlainDate): string;
    /** Day-of-month number, e.g. "23". */
    formatDayNumber(date: PlainDate): string;
    /** Human-readable label for a visible date range (see below). */
    formatRangeTitle(view: string, first: PlainDate, count: number): string;
}
/**
 * Build a set of formatters bound to `locale` / `hour12`.
 *
 * @param locale BCP-47 locale tag. Defaults to `navigator.language`.
 * @param hour12 Force 12h (`true`) or 24h (`false`). When omitted, `Intl`
 *               decides from the locale's default hour cycle (historical
 *               behaviour).
 */
export declare function createFormatters(locale?: string, hour12?: boolean): Formatters;
/** "09:00" — hour:minute label for events. */
export declare function formatTime(epoch: number, timeZone: string): string;
/** "9 AM" style hour tick for the time gutter (no minutes). */
export declare function formatHour(hour: number): string;
/** "Mon" — short weekday name for a plain date. */
export declare function formatWeekdayShort(date: PlainDate): string;
/** "Monday 23 June" — long weekday + day for agenda headers. */
export declare function formatAgendaDay(date: PlainDate): string;
/** Day-of-month number, e.g. "23". */
export declare function formatDayNumber(date: PlainDate): string;
/**
 * Human-readable label for a visible date range, picked to match the active
 * view. `first` is the first visible day; `count` the number of days a time
 * grid covers (ignored for month).
 */
export declare function formatRangeTitle(view: string, first: PlainDate, count: number): string;
//# sourceMappingURL=format.d.ts.map