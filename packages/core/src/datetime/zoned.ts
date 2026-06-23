/**
 * Timezone-aware datetime primitives built on the native `Intl` API.
 *
 * Design goals:
 *  - Zero runtime dependencies (no Luxon/Moment): correctness comes from the
 *    IANA database shipped with every JS engine via `Intl.DateTimeFormat`.
 *  - An absolute instant is always an epoch-milliseconds `number` (UTC).
 *  - Wall-clock values live in a `CalendarDateTime` and are only meaningful
 *    together with an IANA time zone id.
 */

/** A wall-clock date-time, with no inherent time zone. Months are 1-12. */
export interface CalendarDateTime {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
  /** 0-59 */
  second: number;
  /** 0-999 */
  millisecond: number;
}

/** A calendar date with no time component. Months are 1-12. */
export interface PlainDate {
  year: number;
  month: number;
  day: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Validate an IANA time zone id, falling back to a sensible default. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The host environment's current IANA time zone (e.g. "Europe/Paris"). */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Break an absolute instant down into wall-clock parts in the given zone. */
export function epochToWall(epochMs: number, timeZone: string): CalendarDateTime {
  const parts = getFormatter(timeZone).formatToParts(new Date(epochMs));
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  return {
    year: map.year ?? 1970,
    month: map.month ?? 1,
    day: map.day ?? 1,
    hour: map.hour === 24 ? 0 : map.hour ?? 0,
    minute: map.minute ?? 0,
    second: map.second ?? 0,
    millisecond: epochMs - Math.floor(epochMs / 1000) * 1000,
  };
}

/**
 * The UTC offset (in minutes) that applies in `timeZone` at the given instant.
 * Positive east of UTC (Europe/Paris in summer => +120).
 */
export function offsetMinutesAt(epochMs: number, timeZone: string): number {
  const wall = epochToWall(epochMs, timeZone);
  const asUTC = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  );
  return Math.round((asUTC - epochMs) / 60000);
}

/**
 * Convert wall-clock components in `timeZone` to an absolute instant.
 *
 * Handles DST discontinuities by iterating to a fixed point:
 *  - Spring-forward gaps (the wall time does not exist) resolve forward.
 *  - Fall-back overlaps (the wall time happens twice) resolve to the first
 *    occurrence, matching the behaviour of most calendar UIs.
 */
export function wallToEpoch(wall: CalendarDateTime, timeZone: string): number {
  const utcGuess = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  );
  // First approximation using the offset that applies at the guessed instant.
  let offset = offsetMinutesAt(utcGuess, timeZone);
  let epoch = utcGuess - offset * 60000;
  // Re-check: the offset may differ once we land near a DST boundary.
  const offset2 = offsetMinutesAt(epoch, timeZone);
  if (offset2 !== offset) {
    epoch = utcGuess - offset2 * 60000;
    offset = offset2;
  }
  return epoch;
}

/** Midnight (00:00:00.000) of the given calendar date, in `timeZone`. */
export function startOfDayEpoch(date: PlainDate, timeZone: string): number {
  return wallToEpoch(
    { ...date, hour: 0, minute: 0, second: 0, millisecond: 0 },
    timeZone,
  );
}

/** The calendar date (no time) of an instant, in `timeZone`. */
export function epochToPlainDate(epochMs: number, timeZone: string): PlainDate {
  const w = epochToWall(epochMs, timeZone);
  return { year: w.year, month: w.month, day: w.day };
}

const MS_PER_DAY = 86_400_000;

/** Add `n` calendar days to a plain date (pure arithmetic, zone-independent). */
export function addDays(date: PlainDate, n: number): PlainDate {
  const t = Date.UTC(date.year, date.month - 1, date.day) + n * MS_PER_DAY;
  const d = new Date(t);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Add `n` calendar months, clamping the day to the target month's length. */
export function addMonths(date: PlainDate, n: number): PlainDate {
  const total = (date.year * 12 + (date.month - 1)) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const maxDay = daysInMonth(year, month);
  return { year, month, day: Math.min(date.day, maxDay) };
}

/** Number of days in a given month (1-12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: PlainDate): number {
  const dow = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Whole-day difference `b - a` (a, b as plain dates). */
export function diffDays(a: PlainDate, b: PlainDate): number {
  const ta = Date.UTC(a.year, a.month - 1, a.day);
  const tb = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((tb - ta) / MS_PER_DAY);
}

/** True when two plain dates refer to the same day. */
export function isSameDay(a: PlainDate, b: PlainDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * Start of the week containing `date`, given the first day of the week
 * (1 = Monday ... 7 = Sunday). Returns a plain date.
 */
export function startOfWeek(date: PlainDate, weekStartsOn: number): PlainDate {
  const wd = isoWeekday(date);
  let back = wd - weekStartsOn;
  if (back < 0) back += 7;
  return addDays(date, -back);
}
