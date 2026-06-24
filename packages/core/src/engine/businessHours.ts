/**
 * Business-hours helpers: decide whether an instant is within working hours and
 * resolve the working window for a day. Pure and timezone-aware; adapters use
 * these to shade out-of-hours time or restrict where events may be dropped.
 */
import type { BusinessHours } from "../types.js";
import {
  type PlainDate,
  epochToWall,
  isoWeekday,
  wallToEpoch,
} from "../datetime/zoned.js";

const DEFAULT_DAYS = [1, 2, 3, 4, 5]; // Mon–Fri
const MINUTES_PER_DAY = 24 * 60;

/** Clamp a minute-of-day value into [0, 1440]. */
function clampMinute(mins: number): number {
  if (!Number.isFinite(mins)) return 0;
  if (mins < 0) return 0;
  if (mins > MINUTES_PER_DAY) return MINUTES_PER_DAY;
  return mins;
}

/**
 * Whether a given minute-of-day falls inside a single window. Supports windows
 * that wrap past midnight (e.g. a night shift 22:00–06:00, i.e.
 * `{ startMinute: 1320, endMinute: 360 }`): such a window is "in-hours" when the
 * minute is at/after the start OR before the end. A degenerate window where
 * `startMinute === endMinute` covers no time and is always out-of-hours.
 */
function minuteInWindow(minute: number, h: BusinessHours): boolean {
  const start = clampMinute(h.startMinute);
  const end = clampMinute(h.endMinute);
  if (start === end) return false; // empty window
  if (start < end) return minute >= start && minute < end; // same-day window
  return minute >= start || minute < end; // overnight (wraps midnight)
}

/** Normalise a single window or a list (or undefined) to an array. */
export function normalizeBusinessHours(
  bh: BusinessHours | BusinessHours[] | undefined,
): BusinessHours[] {
  if (!bh) return [];
  return Array.isArray(bh) ? bh : [bh];
}

/**
 * Whether `epoch` falls inside any business-hours window, in `timeZone`.
 * With no windows configured, everything is "open" (returns true).
 *
 * Windows that wrap past midnight are supported (see {@link minuteInWindow}).
 * For an overnight window the weekday tested is that of the instant itself, so a
 * 22:00–06:00 window configured for Mondays opens Monday 22:00–24:00 and
 * Tuesday 00:00–06:00 only if Tuesday is also in `daysOfWeek`.
 */
export function isWithinBusinessHours(
  epoch: number,
  timeZone: string,
  bh: BusinessHours | BusinessHours[] | undefined,
): boolean {
  const list = normalizeBusinessHours(bh);
  if (list.length === 0) return true;
  const w = epochToWall(epoch, timeZone);
  const minute = w.hour * 60 + w.minute;
  const wd = isoWeekday({ year: w.year, month: w.month, day: w.day });
  return list.some(
    (h) =>
      (h.daysOfWeek ?? DEFAULT_DAYS).includes(wd) && minuteInWindow(minute, h),
  );
}

/**
 * Every matching business-hours window for `date`, as epoch intervals (in order
 * of configuration). Empty when the day has no working hours.
 *
 * Unlike {@link isWithinBusinessHours} this resolves concrete intervals for a
 * calendar day, so split shifts (e.g. 09:00–12:00 / 14:00–18:00) yield one
 * interval each. A window that wraps past midnight ends on the following day.
 * Degenerate windows (`startMinute === endMinute`) are skipped.
 */
export function businessWindowsForDate(
  date: PlainDate,
  timeZone: string,
  bh: BusinessHours | BusinessHours[] | undefined,
): { start: number; end: number }[] {
  const list = normalizeBusinessHours(bh);
  const wd = isoWeekday(date);
  const at = (mins: number, dayOffset = 0) =>
    wallToEpoch(
      {
        ...date,
        // Adding to `day` past month length is normalised by wallToEpoch's
        // underlying zoned conversion.
        day: date.day + dayOffset,
        hour: Math.floor(mins / 60),
        minute: mins % 60,
        second: 0,
        millisecond: 0,
      },
      timeZone,
    );
  const windows: { start: number; end: number }[] = [];
  for (const h of list) {
    if (!(h.daysOfWeek ?? DEFAULT_DAYS).includes(wd)) continue;
    const start = clampMinute(h.startMinute);
    const end = clampMinute(h.endMinute);
    if (start === end) continue; // empty window
    if (start < end) {
      windows.push({ start: at(start), end: at(end) });
    } else {
      // Overnight: ends the next day.
      windows.push({ start: at(start), end: at(end, 1) });
    }
  }
  return windows;
}

/**
 * The first matching business-hours window for `date`, as an epoch interval, or
 * null when the day has no working hours.
 *
 * @deprecated Use {@link businessWindowsForDate}, which returns every matching
 * window. With split shifts this function silently drops all but the first.
 */
export function businessWindowForDate(
  date: PlainDate,
  timeZone: string,
  bh: BusinessHours | BusinessHours[] | undefined,
): { start: number; end: number } | null {
  return businessWindowsForDate(date, timeZone, bh)[0] ?? null;
}
