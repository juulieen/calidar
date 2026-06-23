/**
 * @calidar/vue — Vue 3 adapter for the headless `@calidar/core` engine.
 *
 * Public surface: the `Calendar` root, the `useCalendar` binding composable,
 * the individual views/toolbar (for custom compositions), and a re-export of
 * the core types adapters commonly need.
 */

// Components
export { Calendar } from "./Calendar.js";
export { CalendarToolbar } from "./CalendarToolbar.js";
export { TimeGridView } from "./TimeGridView.js";
export { MonthView } from "./MonthView.js";
export { AgendaView } from "./AgendaView.js";

// Composable
export { useCalendar, type UseCalendarResult } from "./useCalendar.js";

// Context / callback types
export {
  CalendarContextKey,
  useCalendarContext,
  type CalendarCallbacks,
  type CalendarContextValue,
  type CompactNav,
  type EventDraft,
  type RecurrenceEditScope,
  type RecurringEditRequest,
} from "./context.js";

// Drag composables (advanced)
export {
  useGridDrag,
  type GridDragHandlers,
  type GridMetrics,
  type ActiveDrag,
} from "./useGridDrag.js";
export {
  useDayDrag,
  type DayDragHandlers,
  type ActiveDayDrag,
  type DayDragMode,
  type DayCell,
  type DayDragCommit,
} from "./useDayDrag.js";
export { useCommitEdit, type CommitEditApi } from "./useCommitEdit.js";
export { RecurrenceScopePopover } from "./RecurrenceScopePopover.js";

// Re-export the most useful core types for convenience.
export type {
  CalendarEvent,
  CalendarOptions,
  CalendarSnapshot,
  CalendarStore,
  CalendarState,
  CalendarViewKind,
  EventInstance,
  ViewModel,
  TimeGridViewModel,
  MonthViewModel,
  AgendaViewModel,
  PlainDate,
} from "@calidar/core";
export { createCalendar } from "@calidar/core";
