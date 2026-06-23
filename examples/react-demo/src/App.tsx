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
  type EventInstance,
} from "@calidar/react";

const TIME_ZONES = [
  "Europe/Paris",
  "America/New_York",
  "Asia/Tokyo",
  "UTC",
] as const;

const LOCALES = [
  { value: "en-US", label: "English (US)" },
  { value: "fr-FR", label: "Français" },
  { value: "ja-JP", label: "日本語" },
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

export function App(): JSX.Element {
  const { store, snapshot } = useCalendar({
    view: "week",
    visibleDays: 3,
    timeZone: "Europe/Paris",
    events: DISPLAY_EVENTS,
  });

  const [lastAction, setLastAction] = useState<string>("");
  const [locale, setLocale] = useState<string>("en-US");
  const [hour12, setHour12] = useState<boolean | undefined>(undefined);

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
        <label className="demo__tz">
          <span>Locale</span>
          <select
            id="locale-select"
            name="locale"
            aria-label="Display locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          >
            {LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="demo__tz">
          <span>Clock</span>
          <select
            id="hour12-select"
            name="hour12"
            aria-label="Hour cycle"
            value={hour12 === undefined ? "auto" : hour12 ? "12" : "24"}
            onChange={(e) => {
              const v = e.target.value;
              setHour12(v === "auto" ? undefined : v === "12");
            }}
          >
            <option value="auto">Auto</option>
            <option value="12">12-hour</option>
            <option value="24">24-hour</option>
          </select>
        </label>
        <span className="demo__hint">
          Drag any event to move it. Drag the all-day banners (or month cells)
          across days; drag the recurring “Daily standup” to pick an edit scope.
        </span>
        <span className="demo__status">{lastAction}</span>
      </header>

      <div className="demo__cal">
        <Calendar
          store={store}
          locale={locale}
          hour12={hour12}
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
