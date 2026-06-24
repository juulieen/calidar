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
      (h.daysOfWeek ?? DEFAULT_DAYS).includes(wd) &&
      minute >= h.startMinute &&
      minute < h.endMinute,
  );
}

/**
 * The first matching business-hours window for `date`, as an epoch interval, or
 * null when the day has no working hours.
 */
export function businessWindowForDate(
  date: PlainDate,
  timeZone: string,
  bh: BusinessHours | BusinessHours[] | undefined,
): { start: number; end: number } | null {
  const list = normalizeBusinessHours(bh);
  const wd = isoWeekday(date);
  const h = list.find((x) => (x.daysOfWeek ?? DEFAULT_DAYS).includes(wd));
  if (!h) return null;
  const at = (mins: number) =>
    wallToEpoch(
      {
        ...date,
        hour: Math.floor(mins / 60),
        minute: mins % 60,
        second: 0,
        millisecond: 0,
      },
      timeZone,
    );
  return { start: at(h.startMinute), end: at(h.endMinute) };
}
