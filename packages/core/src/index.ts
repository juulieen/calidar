/**
 * @calidar/core — headless, framework-agnostic calendar engine.
 *
 * Public surface:
 *  - data model & view-model types
 *  - the reactive `CalendarStore` (`createCalendar`)
 *  - pure selectors (`computeView`, `visibleRange`)
 *  - timezone-aware date helpers
 *  - the RRULE expander
 *  - layout algorithms (timed columns, multi-day lanes)
 *  - drag/resize gesture maths
 */

// Types
export type {
  CalendarEvent,
  CalendarResource,
  CalendarState,
  CalendarViewKind,
  BusinessHours,
  EventInstance,
  TimedLayout,
  DayBand,
  EpochRange,
} from "./types.js";

// Business hours
export {
  isWithinBusinessHours,
  businessWindowsForDate,
  businessWindowForDate,
  normalizeBusinessHours,
} from "./engine/businessHours.js";

// Store
export {
  CalendarStore,
  createCalendar,
  type CalendarOptions,
  type CalendarSnapshot,
} from "./engine/store.js";

// Selectors & view models
export {
  computeView,
  computeResourceView,
  computeTimelineView,
  visibleRange,
  type ViewModel,
  type TimeGridViewModel,
  type MonthViewModel,
  type AgendaViewModel,
  type ResourceViewModel,
  type ResourceColumnModel,
  type TimelineViewModel,
  type TimelineRowModel,
  type TimelineBar,
  type TimelineSlot,
  type TimelineUnit,
  type TimelineOptions,
  type DayColumnModel,
  type MonthWeekModel,
  type MonthDayModel,
  type AgendaSectionModel,
} from "./engine/selectors.js";

// Instance expansion
export { instancesInWindow, parseDateValue } from "./engine/instances.js";

// iCalendar (.ics) interop
export { parseICS, toICS, type ToIcsOptions } from "./ics/ics.js";

// Recurring-occurrence editing
export {
  editRecurringEvent,
  type RecurrenceEditScope,
  type RecurrenceEditParams,
  type RecurrenceMutation,
} from "./engine/recurrenceEdit.js";

// Date / timezone helpers
export {
  type CalendarDateTime,
  type PlainDate,
  epochToWall,
  wallToEpoch,
  epochToPlainDate,
  offsetMinutesAt,
  localTimeZone,
  isValidTimeZone,
  startOfDayEpoch,
  addDays,
  addMonths,
  daysInMonth,
  isoWeekday,
  startOfWeek,
  diffDays,
  isSameDay,
} from "./datetime/zoned.js";

// Recurrence
export {
  parseRRule,
  serializeRRule,
  formatUntilUTC,
  expandRecurrence,
  type ParsedRRule,
  type Frequency,
  type ByDay,
  type Occurrence,
  type ExpandParams,
} from "./recurrence/rrule.js";

// Layout
export { layoutTimedColumns } from "./layout/overlap.js";
export { layoutDayBands, laneCount } from "./layout/month.js";

// Interactions
export {
  DragSession,
  applyDrag,
  type DragInit,
  type DragMode,
  type DragPreview,
} from "./interactions/drag.js";
export {
  constrainInterval,
  intervalsOverlap,
  hasConflict,
  firstFreeSlot,
  type Interval,
  type IntervalConstraints,
  type BusyInterval,
} from "./interactions/constraints.js";
