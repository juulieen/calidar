/**
 * Calidar React demo: a full-screen calendar with a realistic event set
 * (recurring, all-day, multi-day and overlapping), a time-zone switcher and the
 * built-in view picker.
 */
import { useState } from "react";
import {
  Calendar,
  useCalendar,
  type CalendarEvent,
  type CalendarResource,
  type EventInstance,
} from "@calidar/react";

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
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:${p(minute)}:00`;
}

/** Whole-day date string for an all-day event. */
function day(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Bookable resources for the Timeline view (rooms shown as rows). */
const RESOURCES: CalendarResource[] = [
  { id: "room-a", title: "Room A", color: "#1a73e8" },
  { id: "room-b", title: "Room B", color: "#0b8043" },
  { id: "room-c", title: "Room C", color: "#9334e6" },
];

const EVENTS: CalendarEvent[] = [
  {
    id: "standup",
    title: "Daily standup",
    start: "2026-01-05T09:30:00", // anchor; rrule drives real occurrences
    end: "2026-01-05T09:45:00",
    rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
    color: "#1a73e8",
    resourceId: "room-a",
  },
  {
    id: "design",
    title: "Design review",
    start: at(0, 10, 0),
    end: at(0, 11, 30),
    color: "#9334e6",
    resourceId: "room-c",
  },
  {
    id: "overlap-1",
    title: "1:1 with Alex",
    start: at(0, 11, 0),
    end: at(0, 12, 0),
    color: "#e8710a",
    resourceId: "room-b",
  },
  {
    id: "lunch",
    title: "Lunch",
    start: at(0, 12, 30),
    end: at(0, 13, 30),
    color: "#0b8043",
    resourceId: "room-b",
  },
  {
    id: "workshop",
    title: "Team workshop",
    start: at(0, 14, 0),
    end: at(0, 16, 30),
    color: "#e8710a",
    resourceId: "room-a",
  },
  {
    id: "focus",
    title: "Focus block",
    start: at(1, 14, 0),
    end: at(1, 17, 0),
    color: "#3f51b5",
    resourceId: "room-c",
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
    resourceId: "room-a",
  },
  {
    id: "client",
    title: "Client call",
    start: at(1, 15, 30),
    end: at(1, 16, 0),
    color: "#1a73e8",
    resourceId: "room-b",
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

export function App(): JSX.Element {
  const { store, snapshot } = useCalendar({
    view: "week",
    visibleDays: 3,
    timeZone: "Europe/Paris",
    events: DISPLAY_EVENTS,
    resources: RESOURCES,
  });

  const [lastAction, setLastAction] = useState<string>("");

  return (
    <div className="demo">
      <header className="demo__bar">
        <strong className="demo__brand">Calidar</strong>
        <label className="demo__tz">
          <span>Time zone</span>
          <select
            id="tz-select"
            name="timeZone"
            aria-label="Display time zone"
            value={snapshot.state.timeZone}
            onChange={(e) => store.setTimeZone(e.target.value)}
          >
            {TIME_ZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        <span className="demo__hint">
          Drag any event to move it. Drag the all-day banners (or month cells)
          across days; drag the recurring “Daily standup” to pick an edit scope.
          Try the “Timeline” view (Day / Week / Month) for a horizontal axis with
          rooms as rows — drag bars sideways to reschedule or onto another room.
        </span>
        <span className="demo__status">{lastAction}</span>
      </header>

      <div className="demo__cal">
        <Calendar
          store={store}
          onEventClick={(inst: EventInstance) =>
            setLastAction(`Clicked: ${inst.title}`)
          }
          onEventCreate={(draft) => {
            const id = `new-${Date.now()}`;
            store.addEvent({
              id,
              title: "New event",
              start: draft.start,
              end: draft.end,
              color: "#1a73e8",
            });
            setLastAction("Created a new event");
          }}
          onEventUpdate={(id) => setLastAction(`Updated: ${id}`)}
          onRecurringEdit={({ instance, scope }) => {
            // Let the adapter apply the mutation; just report the choice.
            setLastAction(`Recurring "${instance.title}" → ${scope}`);
          }}
          onSelectSlot={() => setLastAction("Selected an empty slot")}
        />
      </div>
    </div>
  );
}
