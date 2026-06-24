/**
 * @calidar/react — React adapter for the headless `@calidar/core` engine.
 *
 * Public surface: the `<Calendar>` root, the `useCalendar` binding hook, the
 * individual views/toolbar (for custom compositions), and a re-export of the
 * core types adapters commonly need.
 */

// Components
export { Calendar, type CalendarProps } from "./Calendar.js";
export { CalendarToolbar } from "./CalendarToolbar.js";
export { TimeGridView } from "./TimeGridView.js";
export { MonthView } from "./MonthView.js";
export { AgendaView } from "./AgendaView.js";
export { ResourcesView } from "./ResourcesView.js";
export { TimelineView } from "./TimelineView.js";

// Hook
export { useCalendar, type UseCalendarResult } from "./useCalendar.js";

// Context / callback types
export {
  CalendarContext,
  useCalendarContext,
  type CalendarCallbacks,
  type CalendarContextValue,
  type CompactNav,
  type EventDraft,
  type RecurrenceEditScope,
  type RecurringEditRequest,
  type TimelineMode,
  type TimelineUnit,
} from "./context.js";

// Drag hook (advanced)
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
  ResourceViewModel,
  TimelineViewModel,
  TimelineRowModel,
  TimelineBar,
  TimelineSlot,
  CalendarResource,
  PlainDate,
} from "@calidar/core";
export { createCalendar } from "@calidar/core";
