/**
 * A compact, windowed RFC 5545 RRULE expander.
 *
 * A calendar only ever needs the occurrences that fall inside the currently
 * visible date window, so expansion is bounded by an `[start, end)` epoch
 * window. Occurrences keep the wall-clock time-of-day of the series start and
 * are re-projected through the time zone on every occurrence, so local times
 * stay stable across DST transitions.
 *
 * Supported: FREQ (DAILY/WEEKLY/MONTHLY/YEARLY), INTERVAL, COUNT, UNTIL,
 * BYDAY (incl. nth/last, e.g. 3MO, -1FR), BYMONTHDAY, BYMONTH, WKST.
 * Unsupported parts (BYSETPOS, BYWEEKNO, BYYEARDAY, BYHOUR/MINUTE/SECOND) are
 * ignored rather than throwing; `parseRRule` reports them in `unsupported`.
 */
import {
  type CalendarDateTime,
  type PlainDate,
  addDays,
  addMonths,
  daysInMonth,
  isoWeekday,
  startOfWeek,
  wallToEpoch,
} from "../datetime/zoned.js";

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface ByDay {
  /** ISO weekday 1 (Mon) .. 7 (Sun). */
  weekday: number;
  /** Ordinal within the period (1, 2, -1 for last), or undefined for "every". */
  nth?: number;
}

export interface ParsedRRule {
  freq: Frequency;
  interval: number;
  count?: number;
  /** Epoch ms, inclusive upper bound. */
  until?: number;
  byday?: ByDay[];
  bymonthday?: number[];
  bymonth?: number[];
  /** BYSETPOS: 1-based positions within each period's candidate set; negative
   *  counts from the end (e.g. -1 = last). */
  bysetpos?: number[];
  /** Week start, ISO weekday 1..7. Default Monday. */
  wkst: number;
  /** Tokens that were present but not honoured. */
  unsupported: string[];
}

const WEEKDAY_CODES: Record<string, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

function parseByDay(value: string): ByDay[] {
  const out: ByDay[] = [];
  for (const token of value.split(",")) {
    const m = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(token.trim());
    if (!m) continue;
    const weekday = WEEKDAY_CODES[m[2]!]!;
    out.push(m[1] ? { weekday, nth: Number(m[1]) } : { weekday });
  }
  return out;
}

/** Parse a single RRULE line (with or without the "RRULE:" prefix). */
export function parseRRule(input: string, untilTimeZone = "UTC"): ParsedRRule {
  const body = input.replace(/^RRULE:/i, "").trim();
  const rule: ParsedRRule = {
    freq: "DAILY",
    interval: 1,
    wkst: 1,
    unsupported: [],
  };
  for (const pair of body.split(";")) {
    if (!pair) continue;
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).toUpperCase();
    const value = pair.slice(idx + 1);
    switch (key) {
      case "FREQ":
        rule.freq = value.toUpperCase() as Frequency;
        break;
      case "INTERVAL":
        rule.interval = Math.max(1, parseInt(value, 10) || 1);
        break;
      case "COUNT":
        rule.count = Math.max(0, parseInt(value, 10) || 0);
        break;
      case "UNTIL":
        rule.until = parseUntil(value, untilTimeZone);
        break;
      case "BYDAY":
        rule.byday = parseByDay(value);
        break;
      case "BYMONTHDAY":
        rule.bymonthday = value
          .split(",")
          .map((n) => parseInt(n, 10))
          .filter((n) => !Number.isNaN(n));
        break;
      case "BYMONTH":
        rule.bymonth = value
          .split(",")
          .map((n) => parseInt(n, 10))
          .filter((n) => n >= 1 && n <= 12);
        break;
      case "BYSETPOS":
        rule.bysetpos = value
          .split(",")
          .map((n) => parseInt(n, 10))
          .filter((n) => !Number.isNaN(n) && n !== 0);
        break;
      case "WKST":
        rule.wkst = WEEKDAY_CODES[value.toUpperCase()] ?? 1;
        break;
      default:
        rule.unsupported.push(key);
    }
  }
  return rule;
}

function parseUntil(value: string, timeZone: string): number | undefined {
  // Forms: 20261231 | 20261231T235959Z | 20261231T235959
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s, z] = m;
  const wall: CalendarDateTime = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: h ? Number(h) : 23,
    minute: mi ? Number(mi) : 59,
    second: s ? Number(s) : 59,
    millisecond: 0,
  };
  if (z) {
    return Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
    );
  }
  return wallToEpoch(wall, timeZone);
}

const WEEKDAY_NAMES: Record<number, string> = {
  1: "MO",
  2: "TU",
  3: "WE",
  4: "TH",
  5: "FR",
  6: "SA",
  7: "SU",
};

/** Format an instant as an RFC 5545 UTC UNTIL value (e.g. 20261231T235959Z). */
export function formatUntilUTC(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** Serialise a parsed rule back to a canonical RRULE string (UNTIL as UTC). */
export function serializeRRule(rule: ParsedRRule): string {
  const parts: string[] = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`);
  if (rule.until !== undefined) parts.push(`UNTIL=${formatUntilUTC(rule.until)}`);
  if (rule.byday && rule.byday.length > 0) {
    const tokens = rule.byday.map(
      (b) => `${b.nth ?? ""}${WEEKDAY_NAMES[b.weekday] ?? ""}`,
    );
    parts.push(`BYDAY=${tokens.join(",")}`);
  }
  if (rule.bymonthday && rule.bymonthday.length > 0) {
    parts.push(`BYMONTHDAY=${rule.bymonthday.join(",")}`);
  }
  if (rule.bymonth && rule.bymonth.length > 0) {
    parts.push(`BYMONTH=${rule.bymonth.join(",")}`);
  }
  if (rule.bysetpos && rule.bysetpos.length > 0) {
    parts.push(`BYSETPOS=${rule.bysetpos.join(",")}`);
  }
  if (rule.wkst !== 1) parts.push(`WKST=${WEEKDAY_NAMES[rule.wkst] ?? "MO"}`);
  return parts.join(";");
}

function nthWeekdayOfMonth(year: number, month: number, rule: ByDay): PlainDate | null {
  const total = daysInMonth(year, month);
  const matches: number[] = [];
  for (let day = 1; day <= total; day++) {
    if (isoWeekday({ year, month, day }) === rule.weekday) matches.push(day);
  }
  if (matches.length === 0) return null;
  if (rule.nth === undefined) return null; // handled by caller (all matches)
  const idx = rule.nth > 0 ? rule.nth - 1 : matches.length + rule.nth;
  const day = matches[idx];
  return day === undefined ? null : { year, month, day };
}

/** All day-of-month numbers in a month that satisfy a single BYDAY rule. */
function bydayMatchesInMonth(year: number, month: number, byday: ByDay[]): number[] {
  const days = new Set<number>();
  const total = daysInMonth(year, month);
  for (const rule of byday) {
    if (rule.nth === undefined) {
      for (let day = 1; day <= total; day++) {
        if (isoWeekday({ year, month, day }) === rule.weekday) days.add(day);
      }
    } else {
      const hit = nthWeekdayOfMonth(year, month, rule);
      if (hit) days.add(hit.day);
    }
  }
  return [...days].sort((a, b) => a - b);
}

export interface Occurrence {
  start: number;
  end: number;
}

export interface ExpandParams {
  /** Series start, as wall-clock in `timeZone`. */
  dtstart: CalendarDateTime;
  /** Occurrence length, milliseconds. */
  durationMs: number;
  timeZone: string;
  rule: ParsedRRule;
  /** Epoch-ms starts to exclude (EXDATE). */
  exdates?: Set<number>;
  /** Visible window; only occurrences intersecting it are returned. */
  window: { start: number; end: number };
  /** Safety bound on generated candidates. */
  maxOccurrences?: number;
}

const HARD_CAP = 100_000;

/**
 * Expand a recurrence into concrete occurrences intersecting `window`.
 * Results are sorted by start. COUNT/UNTIL are evaluated against the true
 * series (from dtstart), independent of the window.
 */
export function expandRecurrence(params: ExpandParams): Occurrence[] {
  const { dtstart, durationMs, timeZone, rule, window } = params;
  const exdates = params.exdates ?? new Set<number>();
  const cap = Math.min(params.maxOccurrences ?? HARD_CAP, HARD_CAP);
  const tod = {
    hour: dtstart.hour,
    minute: dtstart.minute,
    second: dtstart.second,
    millisecond: dtstart.millisecond,
  };

  const occurrences: Occurrence[] = [];
  let produced = 0; // counts toward COUNT (true sequence order)

  const emit = (date: PlainDate): "stop" | "continue" => {
    const startEpoch = wallToEpoch({ ...date, ...tod }, timeZone);
    if (rule.until !== undefined && startEpoch > rule.until) return "stop";
    produced++;
    if (rule.count !== undefined && produced > rule.count) return "stop";
    const endEpoch = startEpoch + durationMs;
    // Intersect with window and apply EXDATE.
    if (endEpoch > window.start && startEpoch < window.end && !exdates.has(startEpoch)) {
      occurrences.push({ start: startEpoch, end: endEpoch });
    }
    return "continue";
  };

  const startDate: PlainDate = { year: dtstart.year, month: dtstart.month, day: dtstart.day };
  let iterations = 0;
  const bysetpos = rule.bysetpos;

  const passesMonthFilter = (month: number) =>
    !rule.bymonth || rule.bymonth.includes(month);

  const beforeStart = (d: PlainDate): boolean =>
    d.year < startDate.year ||
    (d.year === startDate.year &&
      (d.month < startDate.month ||
        (d.month === startDate.month && d.day < startDate.day)));

  // Emit a single period's candidate dates (chronological order). Per RFC 5545,
  // the candidate set is bounded by DTSTART *before* BYSETPOS selects the Nth
  // position, so dates before DTSTART are dropped first.
  // Returns true when expansion must stop (COUNT/UNTIL reached).
  const emitPeriod = (candidates: PlainDate[]): boolean => {
    const bounded = candidates.filter((d) => !beforeStart(d));
    const dates =
      bysetpos && bysetpos.length > 0 ? applySetPos(bounded, bysetpos) : bounded;
    for (const date of dates) {
      if (emit(date) === "stop") return true;
    }
    return false;
  };

  if (rule.freq === "DAILY") {
    let cursor = startDate;
    while (iterations++ < cap) {
      const epoch = wallToEpoch({ ...cursor, ...tod }, timeZone);
      if (epoch >= window.end && rule.count === undefined) break;
      const wd = isoWeekday(cursor);
      const bydayOk = !rule.byday || rule.byday.some((b) => b.weekday === wd);
      const bymdOk = !rule.bymonthday || rule.bymonthday.includes(cursor.day);
      if (passesMonthFilter(cursor.month) && bydayOk && bymdOk) {
        if (emitPeriod([cursor])) break;
      }
      cursor = addDays(cursor, rule.interval);
    }
  } else if (rule.freq === "WEEKLY") {
    const weekdays = rule.byday?.map((b) => b.weekday) ?? [isoWeekday(startDate)];
    let weekAnchor = startOfWeek(startDate, rule.wkst);
    while (iterations++ < cap) {
      const weekStartEpoch = wallToEpoch({ ...weekAnchor, ...tod }, timeZone);
      if (weekStartEpoch >= window.end && rule.count === undefined) break;
      const candidates: PlainDate[] = [];
      for (let offset = 0; offset < 7; offset++) {
        const day = addDays(weekAnchor, offset);
        if (!weekdays.includes(isoWeekday(day))) continue;
        if (!passesMonthFilter(day.month)) continue;
        candidates.push(day);
      }
      if (emitPeriod(candidates)) break;
      weekAnchor = addDays(weekAnchor, 7 * rule.interval);
    }
  } else if (rule.freq === "MONTHLY") {
    let month: PlainDate = { year: startDate.year, month: startDate.month, day: 1 };
    while (iterations++ < cap) {
      const monthStartEpoch = wallToEpoch({ ...month, ...tod }, timeZone);
      if (monthStartEpoch >= window.end && rule.count === undefined) break;
      if (passesMonthFilter(month.month)) {
        const candidates = monthlyDays(month.year, month.month, rule, startDate).map(
          (day) => ({ year: month.year, month: month.month, day }),
        );
        if (emitPeriod(candidates)) break;
      }
      month = addMonths(month, rule.interval);
    }
  } else if (rule.freq === "YEARLY") {
    let year = startDate.year;
    while (iterations++ < cap) {
      const yearStartEpoch = wallToEpoch({ year, month: 1, day: 1, ...tod }, timeZone);
      if (yearStartEpoch >= window.end && rule.count === undefined) break;
      const months = rule.bymonth ?? [startDate.month];
      const candidates: PlainDate[] = [];
      for (const m of months) {
        for (const day of yearlyDays(year, m, rule, startDate)) {
          candidates.push({ year, month: m, day });
        }
      }
      candidates.sort(comparePlain);
      if (emitPeriod(candidates)) break;
      year += rule.interval;
    }
  }

  occurrences.sort((a, b) => a.start - b.start);
  return occurrences;
}

/** Chronological comparator for plain dates. */
function comparePlain(a: PlainDate, b: PlainDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** Day-of-month candidates for a MONTHLY period (BYDAY / BYMONTHDAY / default). */
function monthlyDays(
  year: number,
  month: number,
  rule: ParsedRRule,
  startDate: PlainDate,
): number[] {
  if (rule.byday) {
    let days = bydayMatchesInMonth(year, month, rule.byday);
    if (rule.bymonthday) days = days.filter((d) => rule.bymonthday!.includes(d));
    return days;
  }
  if (rule.bymonthday) {
    const total = daysInMonth(year, month);
    return rule.bymonthday
      .map((d) => (d > 0 ? d : total + d + 1))
      .filter((d) => d >= 1 && d <= total)
      .sort((a, b) => a - b);
  }
  return [startDate.day];
}

/** Day-of-month candidates for one month of a YEARLY period. */
function yearlyDays(
  year: number,
  month: number,
  rule: ParsedRRule,
  startDate: PlainDate,
): number[] {
  if (rule.byday) return bydayMatchesInMonth(year, month, rule.byday);
  if (rule.bymonthday) {
    const total = daysInMonth(year, month);
    return rule.bymonthday
      .map((d) => (d > 0 ? d : total + d + 1))
      .filter((d) => d >= 1 && d <= total)
      .sort((a, b) => a - b);
  }
  return [startDate.day];
}

/**
 * Select dates from a period's chronological candidate set by 1-based
 * BYSETPOS positions (negative counts from the end). Result stays in
 * chronological order with duplicates removed.
 */
function applySetPos(dates: PlainDate[], positions: number[]): PlainDate[] {
  const n = dates.length;
  const indices = new Set<number>();
  for (const p of positions) {
    const idx = p > 0 ? p - 1 : n + p;
    if (idx >= 0 && idx < n) indices.add(idx);
  }
  return [...indices].sort((a, b) => a - b).map((i) => dates[i]!);
}
