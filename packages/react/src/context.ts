/**
 * Shared types and React context for the calendar adapter.
 *
 * Views read the live store + snapshot and the host callbacks from this
 * context, so the root `<Calendar>` is the single wiring point.
 */
import { createContext, useContext } from "react";
import type {
  CalendarEvent,
  CalendarSnapshot,
  CalendarStore,
  EventInstance,
  ResourceViewModel,
  ViewModel,
} from "@calidar/core";

/**
 * Compact-window descriptor present only when the responsive layer has
 * collapsed a Week / N-days time view to a narrower day window (phones).
 */
export interface CompactNav {
  /** Number of days the compact window renders (1 or 3). */
  nDays: number;
}

/** A new event the user sketched out by clicking/dragging an empty slot. */
export interface EventDraft {
  /** Absolute start instant (epoch ms, UTC). */
  start: number;
  /** Absolute end instant (epoch ms, UTC). */
  end: number;
  allDay: boolean;
  /** Resource the slot belongs to, when drafted in the resources view. */
  resourceId?: string;
}

/** Scope of a recurring-instance edit. Mirrors `@calidar/core`. */
export type RecurrenceEditScope = "this" | "thisAndFollowing" | "all";

/** Details of a recurring-instance edit, handed to `onRecurringEdit`. */
export interface RecurringEditRequest {
  /** The instance the user acted on (carries `source`, original start/end). */
  instance: EventInstance;
  /** The original occurrence start (epoch ms), before the gesture. */
  occurrenceStart: number;
  /** The patch to apply (new `start`/`end` from the gesture preview). */
  patch: { start: number; end: number };
  /** The chosen scope. */
  scope: RecurrenceEditScope;
}

/** Optional host callbacks fired by the interaction layer. */
export interface CalendarCallbacks {
  /** Fired after a drag-create gesture completes on empty space. */
  onEventCreate?: (draft: EventDraft) => void;
  /** Fired after a move/resize gesture commits new times. */
  onEventUpdate?: (id: string, patch: Partial<CalendarEvent>) => void;
  /** Fired on a plain click of an existing event. */
  onEventClick?: (instance: EventInstance) => void;
  /** Fired when the user selects a slot without dragging far enough to create. */
  onSelectSlot?: (range: { start: number; end: number; resourceId?: string }) => void;
  /**
   * Intercept the application of a recurring-instance edit. Return `true` to
   * signal you've handled the mutation yourself (the adapter then skips its
   * built-in store mutation). If omitted or it returns a falsy value, the
   * adapter applies the `editRecurringEvent` result to the store itself.
   */
  onRecurringEdit?: (request: RecurringEditRequest) => boolean | void;
}

export interface CalendarContextValue extends CalendarCallbacks {
  store: CalendarStore;
  snapshot: CalendarSnapshot;
  /**
   * View model actually rendered. Equals `snapshot.view` except when the
   * responsive layer has collapsed a wide time view to a compact day window,
   * in which case it is a freshly computed "days" model (the store is never
   * mutated).
   */
  effectiveView: ViewModel;
  /** Non-null only while a compact day window is active (see {@link CompactNav}). */
  compactNav: CompactNav | null;
  /**
   * Advance the cursor by one rendered period: a whole view step normally, one
   * day while the resources mode is active, or `compactNav.nDays` days while the
   * compact window is active.
   */
  stepPeriod: (dir: 1 | -1) => void;
  /** True while the local resources mode is active (overrides `snapshot.view`). */
  resourcesActive: boolean;
  /** Toggle the local resources mode on/off. */
  setResourceMode: (on: boolean) => void;
  /** The resources view model while the mode is active, else null. */
  resourceView: ResourceViewModel | null;
}

export const CalendarContext = createContext<CalendarContextValue | null>(null);

/** Read the calendar context; throws if used outside `<Calendar>`. */
export function useCalendarContext(): CalendarContextValue {
  const ctx = useContext(CalendarContext);
  if (!ctx) {
    throw new Error("Calendar components must be rendered inside <Calendar>.");
  }
  return ctx;
}
