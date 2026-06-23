/**
 * Editing a single occurrence of a recurring series — the
 * "this / this-and-following / all" choice every calendar offers.
 *
 * The engine never mutates host data; `editRecurringEvent` is pure and returns
 * the set of event upserts/removals the host should apply. The model follows
 * the common EXDATE + detached-event approach (no RECURRENCE-ID overrides):
 *
 *  - **all**            shift/patch the master series itself.
 *  - **this**           add an EXDATE to the master and emit a standalone,
 *                       non-recurring event for the edited occurrence.
 *  - **thisAndFollowing** cap the master (UNTIL/COUNT) just before the
 *                       occurrence and emit a new series starting at it.
 */
import type { CalendarEvent } from "../types.js";
import { epochToWall, localTimeZone } from "../datetime/zoned.js";
import {
  expandRecurrence,
  parseRRule,
  serializeRRule,
} from "../recurrence/rrule.js";
import { parseDateValue } from "./instances.js";

export type RecurrenceEditScope = "this" | "thisAndFollowing" | "all";

export interface RecurrenceEditParams {
  /** The recurring series being edited. */
  event: CalendarEvent;
  /** Absolute start (epoch ms) of the occurrence the user acted on. */
  occurrenceStart: number;
  scope: RecurrenceEditScope;
  /**
   * New field values. For a move/resize, pass `start`/`end` (epoch ms or ISO);
   * any other field (title, color, ...) is applied too.
   */
  patch?: Partial<CalendarEvent>;
  /** Display time zone, used when the event carries none. */
  timeZone?: string;
}

export interface RecurrenceMutation {
  /** Events to upsert by id (modified master and/or new events). */
  update: CalendarEvent[];
  /** Event ids to delete. */
  remove: string[];
}

function splitFields(patch: Partial<CalendarEvent> | undefined) {
  const { start, end, ...rest } = patch ?? {};
  return { start, end, rest };
}

/**
 * Compute the event upserts/removals for editing one occurrence of a series.
 * Non-recurring events fall back to a plain patch.
 */
export function editRecurringEvent(params: RecurrenceEditParams): RecurrenceMutation {
  const { event, occurrenceStart, scope } = params;
  const tz = event.timeZone ?? params.timeZone ?? localTimeZone();
  const { start: pStart, end: pEnd, rest } = splitFields(params.patch);

  const masterStart = parseDateValue(event.start, tz);
  const masterEnd = Math.max(parseDateValue(event.end, tz), masterStart);
  const duration = masterEnd - masterStart;

  // Resolved times for the edited occurrence.
  const occStart = pStart != null ? parseDateValue(pStart, tz) : occurrenceStart;
  const occEnd = pEnd != null ? parseDateValue(pEnd, tz) : occStart + duration;

  // No recurrence: a plain patch, scope is irrelevant.
  if (!event.rrule) {
    return { update: [{ ...event, ...(params.patch ?? {}) }], remove: [] };
  }

  if (scope === "all") {
    const deltaStart = occStart - occurrenceStart;
    const newStart = masterStart + deltaStart;
    const timeChanged = pStart != null || pEnd != null;
    const newDuration = timeChanged ? occEnd - occStart : duration;
    return {
      update: [{ ...event, ...rest, start: newStart, end: newStart + newDuration }],
      remove: [],
    };
  }

  if (scope === "this") {
    const exdates = [...(event.exdates ?? []), occurrenceStart];
    const master: CalendarEvent = { ...event, exdates };
    const detached: CalendarEvent = {
      ...event,
      id: `${event.id}::occ-${occurrenceStart}`,
      start: occStart,
      end: occEnd,
      rrule: undefined,
      exdates: undefined,
      ...rest,
    };
    return { update: [master, detached], remove: [] };
  }

  // scope === "thisAndFollowing"
  const rule = parseRRule(event.rrule, tz);
  const masterRule = { ...rule };
  const newRule = { ...rule };

  let masterHasOccurrences: boolean;
  if (rule.count !== undefined) {
    const before = expandRecurrence({
      dtstart: epochToWall(masterStart, tz),
      durationMs: duration,
      timeZone: tz,
      rule,
      window: { start: masterStart, end: occurrenceStart },
    });
    const masterCount = before.length;
    masterRule.count = masterCount;
    masterRule.until = undefined;
    newRule.count = Math.max(0, rule.count - masterCount);
    masterHasOccurrences = masterCount > 0;
  } else {
    masterRule.until = occurrenceStart - 1;
    masterRule.count = undefined;
    masterHasOccurrences = occurrenceStart > masterStart;
  }

  const exAll = event.exdates ?? [];
  const exBefore = exAll.filter((e) => parseDateValue(e, tz) < occurrenceStart);
  const exAfter = exAll.filter((e) => parseDateValue(e, tz) >= occurrenceStart);

  const update: CalendarEvent[] = [];
  const remove: string[] = [];

  if (masterHasOccurrences) {
    update.push({
      ...event,
      rrule: serializeRRule(masterRule),
      exdates: exBefore.length ? exBefore : undefined,
    });
  } else {
    remove.push(event.id);
  }

  update.push({
    ...event,
    id: `${event.id}::since-${occurrenceStart}`,
    start: occStart,
    end: occEnd,
    rrule: serializeRRule(newRule),
    exdates: exAfter.length ? exAfter : undefined,
    ...rest,
  });

  return { update, remove };
}
