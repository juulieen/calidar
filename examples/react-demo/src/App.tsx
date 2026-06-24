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

const RESOURCES: CalendarResource[] = [
  { id: "room-a", title: "Room A", color: "#1a73e8" },
  { id: "room-b", title: "Room B", color: "#9334e6" },
  { id: "room-c", title: "Room C", color: "#0b8043" },
];

// Per-resource events on the focal day: overlaps within Room A, a parallel
// booking in Room B, and an all-day hold in Room C.
const RESOURCE_EVENTS: CalendarEvent[] = [
  {
    id: "res-a1",
    title: "Sprint planning",
    start: at(0, 9, 0),
    end: at(0, 10, 30),
    resourceId: "room-a",
    color: "#1a73e8",
  },
  {
    id: "res-a2",
    title: "Vendor call",
    start: at(0, 10, 0),
    end: at(0, 11, 0),
    resourceId: "room-a",
    color: "#e8710a",
  },
  {
    id: "res-b1",
    title: "Interview",
    start: at(0, 9, 30),
    end: at(0, 11, 0),
    resourceId: "room-b",
    color: "#9334e6",
  },
  {
    id: "res-b2",
    title: "Workshop",
    start: at(0, 14, 0),
    end: at(0, 16, 0),
    resourceId: "room-b",
    color: "#3f51b5",
  },
  {
    id: "res-c1",
    title: "Reserved (setup)",
    start: day(0),
    end: day(1),
    allDay: true,
    resourceId: "room-c",
    color: "#0b8043",
  },
  {
    id: "res-c2",
    title: "All-hands",
    start: at(0, 13, 0),
    end: at(0, 14, 0),
    resourceId: "room-c",
    color: "#d93025",
  },
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

/**
 * Bulk event generator: scatters a large volume of events across ±6 months so
 * the infinite, virtualised Agenda has something substantial to scroll through.
 * Deterministic (seeded) so the demo renders identically on every reload.
 */
function makeBulkEvents(count: number): CalendarEvent[] {
  // Tiny deterministic PRNG (mulberry32).
  let seed = 0x9e3779b9;
  const rand = (): number => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const palette = [
    "#1a73e8",
    "#9334e6",
    "#e8710a",
    "#0b8043",
    "#d93025",
    "#00897b",
    "#3f51b5",
    "#c2185b",
  ];
  const titles = [
    "Sync",
    "Review",
    "Workshop",
    "Interview",
    "Planning",
    "Retro",
    "Demo",
    "Coffee chat",
    "Deep work",
    "Roadmap",
    "Support shift",
    "Release",
  ];
  const out: CalendarEvent[] = [];
  for (let i = 0; i < count; i++) {
    // Spread roughly evenly across [-180, +180] days from today.
    const dayOffset = Math.round((rand() * 2 - 1) * 180);
    const allDay = rand() < 0.12;
    const color = palette[Math.floor(rand() * palette.length)]!;
    const title = `${titles[Math.floor(rand() * titles.length)]} #${i + 1}`;
    if (allDay) {
      out.push({
        id: `bulk-${i}`,
        title,
        start: day(dayOffset),
        end: day(dayOffset + 1),
        allDay: true,
        color,
      });
    } else {
      const hour = 7 + Math.floor(rand() * 11); // 07:00–17:00
      const minute = rand() < 0.5 ? 0 : 30;
      const durMin = 30 + Math.floor(rand() * 5) * 30; // 30–150 min
      const startEpoch = new Date();
      startEpoch.setDate(startEpoch.getDate() + dayOffset);
      startEpoch.setHours(hour, minute, 0, 0);
      const endEpoch = new Date(startEpoch.getTime() + durMin * 60_000);
      const p = (n: number) => String(n).padStart(2, "0");
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
      out.push({
        id: `bulk-${i}`,
        title,
        start: fmt(startEpoch),
        end: fmt(endEpoch),
        color,
      });
    }
  }
  return out;
}

/** A few recurring series so the agenda shows expanded occurrences too. */
const RECURRING_EVENTS: CalendarEvent[] = [
  {
    id: "weekly-1on1",
    title: "Weekly 1:1",
    start: "2026-01-06T15:00:00",
    end: "2026-01-06T15:30:00",
    rrule: "FREQ=WEEKLY;BYDAY=TU",
    color: "#9334e6",
  },
  {
    id: "daily-checkin",
    title: "Morning check-in",
    start: "2026-01-05T08:30:00",
    end: "2026-01-05T08:45:00",
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    color: "#0b8043",
  },
  {
    id: "monthly-allhands",
    title: "All hands",
    start: "2026-01-15T17:00:00",
    end: "2026-01-15T18:00:00",
    rrule: "FREQ=MONTHLY;BYMONTHDAY=15",
    color: "#d93025",
  },
];

const BULK_EVENTS = makeBulkEvents(420);

// Pin timed events to a fixed zone so the time-zone switcher visibly converts
// them (Tokyo shifts every meeting by +7/+8h). All-day events stay "floating",
// exactly like real calendars treat them.
const PINNED_ZONE = "Europe/Paris";
const DISPLAY_EVENTS: CalendarEvent[] = [
  ...EVENTS,
  ...RECURRING_EVENTS,
  ...BULK_EVENTS,
  ...RESOURCE_EVENTS,
].map((e) => (e.allDay ? e : { ...e, timeZone: PINNED_ZONE }));

export function App(): JSX.Element {
  const { store, snapshot } = useCalendar({
    view: "agenda",
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
