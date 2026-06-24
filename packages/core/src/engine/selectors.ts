/**
 * Pure selectors that turn calendar state + events into ready-to-render view
 * models. Adapters render these; they never run layout maths themselves.
 */
import type {
  CalendarEvent,
  CalendarResource,
  CalendarState,
  DayBand,
  EventInstance,
  EpochRange,
  TimedLayout,
} from "../types.js";
import {
  type PlainDate,
  addDays,
  addMonths,
  daysInMonth,
  epochToPlainDate,
  isSameDay,
  isoWeekday,
  startOfDayEpoch,
  startOfWeek,
  wallToEpoch,
} from "../datetime/zoned.js";
import { instancesInWindow } from "./instances.js";
import { layoutTimedColumns } from "../layout/overlap.js";
import { laneCount, layoutDayBands } from "../layout/month.js";

export interface DayColumnModel {
  date: PlainDate;
  dayStart: number;
  dayEnd: number;
  isToday: boolean;
  isWeekend: boolean;
  /** Timed events laid out as fractional columns within the day. */
  timed: TimedLayout[];
}

export interface TimeGridViewModel {
  kind: "day" | "days" | "week";
  days: DayColumnModel[];
  /** Multi-day & all-day bands spanning the visible day columns. */
  allDayBands: DayBand[];
  allDayLaneCount: number;
  range: EpochRange;
  hourHeight: number;
  timeZone: string;
}

export interface MonthDayModel {
  date: PlainDate;
  dayStart: number;
  dayEnd: number;
  isToday: boolean;
  isWeekend: boolean;
  inMonth: boolean;
}

export interface MonthWeekModel {
  days: MonthDayModel[];
  bands: DayBand[];
  laneCount: number;
}

export interface MonthViewModel {
  kind: "month";
  weeks: MonthWeekModel[];
  /** Month the grid is focused on (1-12) and its year. */
  month: number;
  year: number;
  range: EpochRange;
  timeZone: string;
}

export interface AgendaSectionModel {
  date: PlainDate;
  dayStart: number;
  instances: EventInstance[];
}

export interface AgendaViewModel {
  kind: "agenda";
  sections: AgendaSectionModel[];
  range: EpochRange;
  timeZone: string;
}

export interface ResourceColumnModel {
  resource: CalendarResource;
  dayStart: number;
  dayEnd: number;
  /** Timed events for this resource, laid out within the day. */
  timed: TimedLayout[];
  /** All-day / multi-day instances for this resource. */
  allDay: EventInstance[];
}

export interface ResourceViewModel {
  kind: "resources";
  date: PlainDate;
  isToday: boolean;
  columns: ResourceColumnModel[];
  range: EpochRange;
  hourHeight: number;
  timeZone: string;
}

export type ViewModel = TimeGridViewModel | MonthViewModel | AgendaViewModel;

const MS_PER_DAY = 86_400_000;

function isWeekend(date: PlainDate): boolean {
  const wd = isoWeekday(date);
  return wd === 6 || wd === 7;
}

/** True when an instance should be rendered as a horizontal band. */
function isBand(instance: EventInstance, timeZone: string): boolean {
  if (instance.allDay) return true;
  const a = epochToPlainDate(instance.start, timeZone);
  const b = epochToPlainDate(instance.end - 1, timeZone);
  return !isSameDay(a, b);
}

/** Day boundaries (epoch ms) for `count` consecutive days from `first`. */
function dayBoundaries(first: PlainDate, count: number, timeZone: string): number[] {
  const bounds: number[] = [];
  for (let i = 0; i <= count; i++) {
    bounds.push(startOfDayEpoch(addDays(first, i), timeZone));
  }
  return bounds;
}

function buildTimeGrid(
  kind: "day" | "days" | "week",
  first: PlainDate,
  count: number,
  state: CalendarState,
  events: CalendarEvent[],
  today: PlainDate,
): TimeGridViewModel {
  const tz = state.timeZone;
  const bounds = dayBoundaries(first, count, tz);
  const range: EpochRange = { start: bounds[0]!, end: bounds[count]! };
  const instances = instancesInWindow(events, range, tz);

  const bandInstances: EventInstance[] = [];
  const timedInstances: EventInstance[] = [];
  for (const inst of instances) {
    (isBand(inst, tz) ? bandInstances : timedInstances).push(inst);
  }

  const days: DayColumnModel[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(first, i);
    const dayStart = bounds[i]!;
    const dayEnd = bounds[i + 1]!;
    const dayTimed = timedInstances.filter(
      (inst) => inst.end > dayStart && inst.start < dayEnd,
    );
    days.push({
      date,
      dayStart,
      dayEnd,
      isToday: isSameDay(date, today),
      isWeekend: isWeekend(date),
      timed: layoutTimedColumns(dayTimed, dayStart, dayEnd),
    });
  }

  const allDayBands = layoutDayBands(bandInstances, bounds);
  return {
    kind,
    days,
    allDayBands,
    allDayLaneCount: laneCount(allDayBands),
    range,
    hourHeight: state.hourHeight,
    timeZone: tz,
  };
}

function buildMonth(
  state: CalendarState,
  events: CalendarEvent[],
  cursorDate: PlainDate,
  today: PlainDate,
): MonthViewModel {
  const tz = state.timeZone;
  const firstOfMonth: PlainDate = { ...cursorDate, day: 1 };
  const gridStart = startOfWeek(firstOfMonth, state.weekStartsOn);
  // Always render 6 weeks for a stable grid height (Google/Outlook behaviour).
  const totalDays = 42;
  const bounds = dayBoundaries(gridStart, totalDays, tz);
  const range: EpochRange = { start: bounds[0]!, end: bounds[totalDays]! };
  const instances = instancesInWindow(events, range, tz).filter((i) =>
    isBand(i, tz),
  );

  const weeks: MonthWeekModel[] = [];
  for (let w = 0; w < 6; w++) {
    const weekBounds = bounds.slice(w * 7, w * 7 + 8);
    const weekInstances = instances.filter(
      (i) => i.end > weekBounds[0]! && i.start < weekBounds[7]!,
    );
    const bands = layoutDayBands(weekInstances, weekBounds);
    const days: MonthDayModel[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(gridStart, w * 7 + d);
      days.push({
        date,
        dayStart: weekBounds[d]!,
        dayEnd: weekBounds[d + 1]!,
        isToday: isSameDay(date, today),
        isWeekend: isWeekend(date),
        inMonth: date.month === cursorDate.month && date.year === cursorDate.year,
      });
    }
    weeks.push({ days, bands, laneCount: laneCount(bands) });
  }

  return {
    kind: "month",
    weeks,
    month: cursorDate.month,
    year: cursorDate.year,
    range,
    timeZone: tz,
  };
}

function buildAgenda(
  state: CalendarState,
  events: CalendarEvent[],
  cursorDate: PlainDate,
  today: PlainDate,
  spanDays = 30,
): AgendaViewModel {
  const tz = state.timeZone;
  const bounds = dayBoundaries(cursorDate, spanDays, tz);
  const range: EpochRange = { start: bounds[0]!, end: bounds[spanDays]! };
  const instances = instancesInWindow(events, range, tz);

  const sections: AgendaSectionModel[] = [];
  for (let i = 0; i < spanDays; i++) {
    const date = addDays(cursorDate, i);
    const dayStart = bounds[i]!;
    const dayEnd = bounds[i + 1]!;
    const dayInstances = instances.filter(
      (inst) => inst.end > dayStart && inst.start < dayEnd,
    );
    if (dayInstances.length > 0) {
      sections.push({ date, dayStart, instances: dayInstances });
    }
  }
  void today;
  return { kind: "agenda", sections, range, timeZone: tz };
}

/**
 * Build the resources view model for the focal day: one column per configured
 * resource, each laid out independently. This is a standalone view (not part of
 * the main `ViewModel` union) — adapters opt in and drive day navigation
 * themselves (cursor moves one day at a time).
 */
export function computeResourceView(
  state: CalendarState,
  events: CalendarEvent[],
  now: number = currentNow(),
): ResourceViewModel {
  const tz = state.timeZone;
  const today = epochToPlainDate(now, tz);
  const cursorDate = epochToPlainDate(state.cursor, tz);
  const dayStart = startOfDayEpoch(cursorDate, tz);
  const dayEnd = startOfDayEpoch(addDays(cursorDate, 1), tz);
  const range: EpochRange = { start: dayStart, end: dayEnd };
  const instances = instancesInWindow(events, range, tz);

  const columns: ResourceColumnModel[] = state.resources.map((resource) => {
    const own = instances.filter((i) => i.resourceId === resource.id);
    const timed: EventInstance[] = [];
    const allDay: EventInstance[] = [];
    for (const inst of own) (isBand(inst, tz) ? allDay : timed).push(inst);
    return {
      resource,
      dayStart,
      dayEnd,
      timed: layoutTimedColumns(timed, dayStart, dayEnd),
      allDay,
    };
  });

  return {
    kind: "resources",
    date: cursorDate,
    isToday: isSameDay(cursorDate, today),
    columns,
    range,
    hourHeight: state.hourHeight,
    timeZone: tz,
  };
}

// ---- Timeline view (resources as rows, horizontal time axis) -------------

export type TimelineUnit = "day" | "week" | "month";

export interface TimelineSlot {
  /** Slot start instant (epoch ms). */
  start: number;
  /** Fractional position across the range, 0..1. */
  left: number;
  /** True for the slot covering "now" (day unit) or today (week/month). */
  isNow?: boolean;
}

export interface TimelineBar {
  instance: EventInstance;
  /** Fractional left position across the range, 0..1. */
  left: number;
  /** Fractional width across the range, 0..1. */
  width: number;
  /** Vertical lane within the row (overlapping bars stack). */
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface TimelineRowModel {
  /** The resource for this row, or null for the catch-all row (no resources). */
  resource: CalendarResource | null;
  bars: TimelineBar[];
  /** Number of vertical lanes this row needs. */
  lanes: number;
}

export interface TimelineViewModel {
  kind: "timeline";
  unit: TimelineUnit;
  date: PlainDate;
  range: EpochRange;
  slots: TimelineSlot[];
  rows: TimelineRowModel[];
  timeZone: string;
}

export interface TimelineOptions {
  /** Axis granularity: a single day (hour slots), a week or a month (day slots). */
  unit?: TimelineUnit;
}

/** Greedy lane packing of time intervals (overlapping items get higher lanes). */
function packTimeLanes(items: EventInstance[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    lanes.set(item.key, lane);
  }
  return lanes;
}

/**
 * Build the timeline view: one row per configured resource (or a single
 * catch-all row when none), with events as horizontal bars positioned along a
 * day/week/month time axis and lane-packed within their row. Standalone (not in
 * the main `ViewModel` union); adapters opt in and drive navigation.
 */
export function computeTimelineView(
  state: CalendarState,
  events: CalendarEvent[],
  options: TimelineOptions = {},
  now: number = currentNow(),
): TimelineViewModel {
  const tz = state.timeZone;
  const unit = options.unit ?? "day";
  const cursorDate = epochToPlainDate(state.cursor, tz);

  // Range + axis slots.
  let rangeStart: number;
  let rangeEnd: number;
  const slots: TimelineSlot[] = [];
  const today = epochToPlainDate(now, tz);

  if (unit === "day") {
    rangeStart = startOfDayEpoch(cursorDate, tz);
    rangeEnd = startOfDayEpoch(addDays(cursorDate, 1), tz);
    const showsToday = isSameDay(cursorDate, today);
    for (let h = 0; h < 24; h++) {
      const start = wallToEpoch({ ...cursorDate, hour: h, minute: 0, second: 0, millisecond: 0 }, tz);
      const nextStart = wallToEpoch({ ...cursorDate, hour: h + 1, minute: 0, second: 0, millisecond: 0 }, tz);
      slots.push({
        start,
        left: frac(start, rangeStart, rangeEnd),
        isNow: showsToday && now >= start && now < nextStart,
      });
    }
  } else {
    const first = unit === "week" ? startOfWeek(cursorDate, state.weekStartsOn) : { ...cursorDate, day: 1 };
    const count = unit === "week" ? 7 : daysInMonth(cursorDate.year, cursorDate.month);
    rangeStart = startOfDayEpoch(first, tz);
    rangeEnd = startOfDayEpoch(addDays(first, count), tz);
    for (let i = 0; i < count; i++) {
      const date = addDays(first, i);
      const start = startOfDayEpoch(date, tz);
      slots.push({ start, left: frac(start, rangeStart, rangeEnd), isNow: isSameDay(date, today) });
    }
  }

  const span = rangeEnd - rangeStart;
  const instances = instancesInWindow(events, { start: rangeStart, end: rangeEnd }, tz);

  const makeRow = (
    resource: CalendarResource | null,
    rowInstances: EventInstance[],
  ): TimelineRowModel => {
    const lanes = packTimeLanes(rowInstances);
    const bars: TimelineBar[] = rowInstances.map((inst) => {
      const s = Math.max(inst.start, rangeStart);
      const e = Math.min(inst.end, rangeEnd);
      return {
        instance: inst,
        left: (s - rangeStart) / span,
        width: Math.max((e - s) / span, 0),
        lane: lanes.get(inst.key) ?? 0,
        continuesBefore: inst.start < rangeStart,
        continuesAfter: inst.end > rangeEnd,
      };
    });
    return { resource, bars, lanes: laneCountFromMap(lanes) };
  };

  const rows: TimelineRowModel[] =
    state.resources.length > 0
      ? state.resources.map((r) =>
          makeRow(
            r,
            instances.filter((i) => i.resourceId === r.id),
          ),
        )
      : [makeRow(null, instances)];

  return {
    kind: "timeline",
    unit,
    date: cursorDate,
    range: { start: rangeStart, end: rangeEnd },
    slots,
    rows,
    timeZone: tz,
  };
}

function frac(epoch: number, start: number, end: number): number {
  return (epoch - start) / (end - start);
}

function laneCountFromMap(lanes: Map<string, number>): number {
  let max = -1;
  for (const v of lanes.values()) if (v > max) max = v;
  return max + 1;
}

/** Compute the view model for the current state + events. */
export function computeView(
  state: CalendarState,
  events: CalendarEvent[],
  now: number = currentNow(),
): ViewModel {
  const tz = state.timeZone;
  const today = epochToPlainDate(now, tz);
  const cursorDate = epochToPlainDate(state.cursor, tz);

  switch (state.view) {
    case "day":
      return buildTimeGrid("day", cursorDate, 1, state, events, today);
    case "days":
      return buildTimeGrid(
        "days",
        cursorDate,
        Math.max(1, state.visibleDays),
        state,
        events,
        today,
      );
    case "week": {
      const weekStart = startOfWeek(cursorDate, state.weekStartsOn);
      return buildTimeGrid("week", weekStart, 7, state, events, today);
    }
    case "month":
      return buildMonth(state, events, cursorDate, today);
    case "agenda":
      return buildAgenda(state, events, cursorDate, today);
  }
}

/** The visible epoch range for a given state, without computing layout. */
export function visibleRange(state: CalendarState): EpochRange {
  const tz = state.timeZone;
  const cursorDate = epochToPlainDate(state.cursor, tz);
  switch (state.view) {
    case "day":
      return rangeForDays(cursorDate, 1, tz);
    case "days":
      return rangeForDays(cursorDate, Math.max(1, state.visibleDays), tz);
    case "week":
      return rangeForDays(startOfWeek(cursorDate, state.weekStartsOn), 7, tz);
    case "month": {
      const gridStart = startOfWeek({ ...cursorDate, day: 1 }, state.weekStartsOn);
      return rangeForDays(gridStart, 42, tz);
    }
    case "agenda":
      return rangeForDays(cursorDate, 30, tz);
  }
}

function rangeForDays(first: PlainDate, count: number, tz: string): EpochRange {
  return {
    start: startOfDayEpoch(first, tz),
    end: startOfDayEpoch(addDays(first, count), tz),
  };
}

// Indirection so tests can run without Date.now flakiness if needed.
function currentNow(): number {
  return Date.now();
}

export { MS_PER_DAY, addMonths };
