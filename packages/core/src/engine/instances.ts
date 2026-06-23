/**
 * Normalisation of host `CalendarEvent`s into concrete `EventInstance`s for a
 * given window, expanding recurrence rules along the way.
 */
import type { CalendarEvent, EventInstance, EpochRange } from "../types.js";
import {
  type CalendarDateTime,
  epochToWall,
  startOfDayEpoch,
  wallToEpoch,
} from "../datetime/zoned.js";
import { expandRecurrence, parseRRule } from "../recurrence/rrule.js";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_TZ = /[zZ]|[+-]\d{2}:?\d{2}$/;
const LOCAL_DT =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/;

/**
 * Resolve a host date value to an absolute epoch (ms).
 *  - numbers are treated as epoch ms;
 *  - date-only strings ("2026-06-23") become midnight in `timeZone`;
 *  - strings carrying an offset/Z are absolute;
 *  - bare local date-times are interpreted as wall-clock in `timeZone`.
 */
export function parseDateValue(
  value: string | number,
  timeZone: string,
): number {
  if (typeof value === "number") return value;
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number) as [number, number, number];
    return startOfDayEpoch({ year: y, month: m, day: d }, timeZone);
  }
  if (HAS_TZ.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const m = LOCAL_DT.exec(trimmed);
  if (m) {
    const wall: CalendarDateTime = {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4]),
      minute: Number(m[5]),
      second: m[6] ? Number(m[6]) : 0,
      millisecond: m[7] ? Number(m[7].padEnd(3, "0")) : 0,
    };
    return wallToEpoch(wall, timeZone);
  }
  // Last resort: native parse.
  const fallback = Date.parse(trimmed);
  return Number.isNaN(fallback) ? 0 : fallback;
}

function resolveColor(e: CalendarEvent): string | undefined {
  return e.color;
}

/**
 * Produce every event instance that intersects `window`, expanding recurring
 * events. The `displayTimeZone` is used for events that don't carry their own.
 */
export function instancesInWindow(
  events: CalendarEvent[],
  window: EpochRange,
  displayTimeZone: string,
): EventInstance[] {
  const out: EventInstance[] = [];
  for (const event of events) {
    const tz = event.timeZone ?? displayTimeZone;
    const start = parseDateValue(event.start, tz);
    const end = Math.max(parseDateValue(event.end, tz), start);
    const durationMs = end - start;
    const editable = event.editable ?? true;
    const color = resolveColor(event);

    const exdates = new Set<number>();
    if (event.exdates) {
      for (const ex of event.exdates) exdates.add(parseDateValue(ex, tz));
    }

    // Track emitted occurrence starts so RDATE entries don't duplicate them.
    const emitted = new Set<number>();
    const push = (occStart: number, occEnd: number, recurring: boolean, key: string) => {
      emitted.add(occStart);
      if (occEnd > window.start && occStart < window.end) {
        out.push({
          key,
          eventId: event.id,
          title: event.title,
          start: occStart,
          end: occEnd,
          allDay: event.allDay ?? false,
          recurring,
          color,
          editable,
          source: event,
        });
      }
    };

    if (event.rrule) {
      const rule = parseRRule(event.rrule, tz);
      const dtstart = epochToWall(start, tz);
      const occurrences = expandRecurrence({
        dtstart,
        durationMs,
        timeZone: tz,
        rule,
        exdates,
        window,
      });
      for (const occ of occurrences) {
        push(occ.start, occ.end, true, `${event.id}@${occ.start}`);
      }
    } else if (!exdates.has(start)) {
      push(start, end, false, event.id);
    }

    // RDATE — additional explicit occurrence dates (RFC 5545), in addition to
    // the master/RRULE set, minus EXDATE and any already-emitted start.
    if (event.rdates) {
      for (const rd of event.rdates) {
        const rdStart = parseDateValue(rd, tz);
        if (exdates.has(rdStart) || emitted.has(rdStart)) continue;
        push(rdStart, rdStart + durationMs, true, `${event.id}@${rdStart}`);
      }
    }
  }
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  return out;
}
