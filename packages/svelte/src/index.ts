/**
 * @calidar/svelte — Svelte 5 (runes) adapter for the headless `@calidar/core`
 * calendar engine. Import the styles separately: `@calidar/svelte/styles.css`.
 */
export { default as Calendar } from "./Calendar.svelte";
export { default as Toolbar } from "./Toolbar.svelte";
export { default as TimeGridView } from "./TimeGridView.svelte";
export { default as MonthView } from "./MonthView.svelte";
export { default as AgendaView } from "./AgendaView.svelte";

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

// Formatting helpers.
export {
  formatTime,
  formatHour,
  formatWeekdayShort,
  formatAgendaDay,
  formatDayNumber,
  formatRangeTitle,
} from "./format.js";

// Re-export commonly used core types for convenience.
export type {
  CalendarEvent,
  CalendarOptions,
  CalendarSnapshot,
  CalendarStore,
  CalendarViewKind,
  EventInstance,
} from "@calidar/core";
