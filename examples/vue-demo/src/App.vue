<!--
  Calidar Vue demo: a full-screen calendar with a realistic event set
  (recurring, all-day, multi-day and overlapping), a time-zone switcher and the
  built-in view picker.
-->
<script setup lang="ts">
import { ref } from "vue";
import {
  Calendar,
  useCalendar,
  type CalendarEvent,
  type EventDraft,
  type EventInstance,
  type RecurringEditRequest,
} from "@calidar/vue";

const TIME_ZONES = [
  "Europe/Paris",
  "America/New_York",
  "Asia/Tokyo",
  "UTC",
] as const;

/** ISO date-time string (local-to-the-event) for `daysFromToday` at `h:m`. */
function at(daysFromToday: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  // Build a zone-less wall-clock ISO string (no trailing Z): the engine
  // interprets it in the calendar's display time zone.
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:${p(minute)}:00`;
}

/** Whole-day date string for an all-day event. */
function day(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const EVENTS: CalendarEvent[] = [
  {
    id: "standup",
    title: "Daily standup",
    start: "2026-01-05T09:30:00", // anchor; rrule drives real occurrences
    end: "2026-01-05T09:45:00",
    rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
    color: "#1a73e8",
  },
  {
    id: "design",
    title: "Design review",
    start: at(0, 10, 0),
    end: at(0, 11, 30),
    color: "#9334e6",
  },
  {
    id: "overlap-1",
    title: "1:1 with Alex",
    start: at(0, 11, 0),
    end: at(0, 12, 0),
    color: "#e8710a",
  },
  {
    id: "lunch",
    title: "Lunch",
    start: at(0, 12, 30),
    end: at(0, 13, 30),
    color: "#0b8043",
  },
  {
    id: "focus",
    title: "Focus block",
    start: at(1, 14, 0),
    end: at(1, 17, 0),
    color: "#3f51b5",
  },
  {
    id: "allday",
    title: "Company offsite",
    start: day(2),
    end: day(3),
    allDay: true,
    color: "#d93025",
  },
  {
    id: "multiday",
    title: "Conference trip",
    start: at(3, 9, 0),
    end: at(5, 18, 0),
    color: "#00897b",
  },
  {
    id: "client",
    title: "Client call",
    start: at(1, 15, 30),
    end: at(1, 16, 0),
    color: "#1a73e8",
  },
  {
    id: "locked",
    title: "Public holiday (locked)",
    start: day(6),
    end: day(7),
    allDay: true,
    editable: false,
    color: "#5f6368",
  },
];

// Pin timed events to a fixed zone so the time-zone switcher visibly converts
// them (Tokyo shifts every meeting by +7/+8h). All-day events stay "floating",
// exactly like real calendars treat them.
const PINNED_ZONE = "Europe/Paris";
const DISPLAY_EVENTS: CalendarEvent[] = EVENTS.map((e) =>
  e.allDay ? e : { ...e, timeZone: PINNED_ZONE },
);

const { store, snapshot } = useCalendar({
  view: "week",
  visibleDays: 3,
  timeZone: "Europe/Paris",
  events: DISPLAY_EVENTS,
});

const lastAction = ref("");

function onTzChange(e: Event): void {
  const value = (e.target as HTMLSelectElement).value;
  store.setTimeZone(value);
}

function onEventClick(inst: EventInstance): void {
  lastAction.value = `Clicked: ${inst.title}`;
}

function onEventCreate(draft: EventDraft): void {
  const id = `new-${Date.now()}`;
  store.addEvent({
    id,
    title: "New event",
    start: draft.start,
    end: draft.end,
    allDay: draft.allDay,
    color: "#1a73e8",
  });
  lastAction.value = "Created a new event";
}

function onEventUpdate(id: string): void {
  lastAction.value = `Updated: ${id}`;
}

function onRecurringEdit(req: RecurringEditRequest): void {
  // Let the adapter apply the mutation; just report the choice.
  lastAction.value = `Recurring "${req.instance.title}" → ${req.scope}`;
}

function onSelectSlot(): void {
  lastAction.value = "Selected an empty slot";
}
</script>

<template>
  <div class="demo">
    <header class="demo__bar">
      <strong class="demo__brand">Calidar</strong>
      <label class="demo__tz">
        <span>Time zone</span>
        <select
          id="tz-select"
          name="timeZone"
          aria-label="Display time zone"
          :value="snapshot.state.timeZone"
          @change="onTzChange"
        >
          <option v-for="tz in TIME_ZONES" :key="tz" :value="tz">
            {{ tz }}
          </option>
        </select>
      </label>
      <span class="demo__hint">
        Drag any event to move it. Drag the all-day banners (or month cells)
        across days; drag the recurring “Daily standup” to pick an edit scope.
      </span>
      <span class="demo__status">{{ lastAction }}</span>
    </header>

    <div class="demo__cal">
      <Calendar
        :store="store"
        :on-event-click="onEventClick"
        :on-event-create="onEventCreate"
        :on-event-update="onEventUpdate"
        :on-recurring-edit="onRecurringEdit"
        :on-select-slot="onSelectSlot"
      />
    </div>
  </div>
</template>
