/**
 * @calidar/svelte — Svelte 5 (runes) adapter for the headless `@calidar/core`
 * calendar engine. Import the styles separately: `@calidar/svelte/styles.css`.
 */
export { default as Calendar } from "./Calendar.svelte";
export { default as Toolbar } from "./Toolbar.svelte";
export { default as TimeGridView } from "./TimeGridView.svelte";
export { default as MonthView } from "./MonthView.svelte";
export { default as AgendaView } from "./AgendaView.svelte";
export { default as InfiniteAgendaView } from "./InfiniteAgendaView.svelte";
export { default as ResourcesView } from "./ResourcesView.svelte";
export { default as TimelineView } from "./TimelineView.svelte";

// Reactivity bridge.
export { createCalendarState, type CalendarState } from "./calendarState.svelte.js";

// Drag controllers (advanced/custom views).
export {
  GridDragController,
  type GridMetrics,
  type GridDragOptions,
} from "./gridDrag.svelte.js";
export {
  DayDragController,
  type DayMetrics,
  type DayDragOptions,
  type DayDragActive,
  type DayCommit,
  type DayDragMode,
} from "./dayDrag.svelte.js";

// Recurring-edit helpers (apply core mutations to a store).
export {
  commitDirect,
  applyRecurringEdit,
  routeCommit,
  type EditBounds,
  type ExtraPatch,
} from "./recurringEdit.js";
export { default as RecurringScopeDialog } from "./RecurringScopeDialog.svelte";

// Adapter types.
export type {
  CalendarCallbacks,
  SlotSelection,
  ActiveDrag,
  RecurringEditScope,
  RecurringEditRequest,
} from "./types.js";

// Formatting helpers (locale / hour12 aware).
export {
  createFormatters,
  formatTime,
  formatHour,
  formatWeekdayShort,
  formatAgendaDay,
  formatDayNumber,
  formatMonthYear,
  formatRangeTitle,
  timelineTickLabel,
  type Formatters,
} from "./format.js";

// Re-export commonly used core types for convenience.
export type {
  CalendarEvent,
  CalendarOptions,
  CalendarResource,
  CalendarSnapshot,
  CalendarStore,
  CalendarViewKind,
  EventInstance,
  ResourceViewModel,
  TimelineViewModel,
  TimelineUnit,
} from "@calidar/core";
