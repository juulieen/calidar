<script lang="ts">
  import {
    Calendar,
    createCalendarState,
    type CalendarEvent,
    type EventInstance,
  } from "@calidar/svelte";
  import type { SlotSelection } from "@calidar/svelte";

  // Anchor the demo data on the current week so events are always visible.
  const now = new Date();
  function isoDate(offsetDays: number): string {
    const d = new Date(now);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }
  function at(offsetDays: number, h: number, m = 0): string {
    return `${isoDate(offsetDays)}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  }

  const events: CalendarEvent[] = [
    // Recurring standup, Mondays & Wednesdays.
    {
      id: "standup",
      title: "Team standup",
      start: at(0, 9, 30),
      end: at(0, 9, 45),
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
      color: "#1a73e8",
    },
    // All-day event today.
    {
      id: "allday",
      title: "Company offsite",
      start: isoDate(0),
      end: isoDate(1),
      allDay: true,
      color: "#34a853",
    },
    // Multi-day conference.
    {
      id: "conf",
      title: "DevConf 2026",
      start: isoDate(1),
      end: isoDate(4),
      allDay: true,
      color: "#a142f4",
    },
    // Overlapping morning meetings today.
    {
      id: "design",
      title: "Design review",
      start: at(0, 10, 0),
      end: at(0, 11, 30),
      color: "#fbbc04",
    },
    {
      id: "1on1",
      title: "1:1 with Sam",
      start: at(0, 10, 30),
      end: at(0, 11, 0),
      color: "#ea4335",
    },
    {
      id: "lunch",
      title: "Lunch",
      start: at(0, 12, 30),
      end: at(0, 13, 30),
      color: "#ff6d01",
    },
    {
      id: "focus",
      title: "Focus block",
      start: at(1, 14, 0),
      end: at(1, 16, 0),
      color: "#1a73e8",
    },
    {
      id: "review",
      title: "Sprint review (read-only)",
      start: at(2, 15, 0),
      end: at(2, 16, 0),
      color: "#5f6368",
      editable: false,
    },
  ];

  // Pin timed events to a fixed zone so the time-zone switcher visibly
  // converts them (Tokyo shifts every meeting by +7/+8h). All-day events stay
  // "floating", exactly like real calendars treat them.
  const PINNED_ZONE = "Europe/Paris";
  const displayEvents: CalendarEvent[] = events.map((e) =>
    e.allDay ? e : { ...e, timeZone: PINNED_ZONE },
  );

  const cal = createCalendarState({
    view: "week",
    timeZone: "Europe/Paris",
    events: displayEvents,
  });

  const zones = ["Europe/Paris", "America/New_York", "Asia/Tokyo"];
  let timeZone = $state("Europe/Paris");

  const locales = [
    { value: "en-US", label: "English (US)" },
    { value: "fr-FR", label: "Français" },
    { value: "ja-JP", label: "日本語" },
  ];
  let locale = $state("en-US");
  let hour12 = $state<boolean | undefined>(undefined);

  function onZoneChange(e: Event): void {
    const tz = (e.target as HTMLSelectElement).value;
    timeZone = tz;
    cal.store.setTimeZone(tz);
  }

  function onLocaleChange(e: Event): void {
    locale = (e.target as HTMLSelectElement).value;
  }

  function onHour12Change(e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    hour12 = v === "auto" ? undefined : v === "12";
  }

  // Wire callbacks back to the store for a live, editable demo.
  let nextId = 1;
  function onEventCreate(sel: SlotSelection): void {
    cal.store.addEvent({
      id: `new-${nextId++}`,
      title: "New event",
      start: sel.start,
      end: sel.end,
      allDay: sel.allDay,
      color: "#1a73e8",
    });
  }
  function onSelectSlot(sel: SlotSelection): void {
    onEventCreate(sel);
  }
  function onEventClick(inst: EventInstance): void {
    // eslint-disable-next-line no-console
    console.log("clicked", inst.title, inst.key);
  }
</script>

<div class="demo">
  <header class="demo__bar">
    <strong class="demo__brand">
      <span class="demo__mark" aria-hidden="true"></span>
      Calidar
    </strong>
    <label class="demo__zone">
      Time zone
      <select id="tz-select" name="timeZone" aria-label="Display time zone" value={timeZone} onchange={onZoneChange}>
        {#each zones as z (z)}
          <option value={z}>{z}</option>
        {/each}
      </select>
    </label>
    <label class="demo__zone">
      Locale
      <select id="locale-select" name="locale" aria-label="Display locale" value={locale} onchange={onLocaleChange}>
        {#each locales as l (l.value)}
          <option value={l.value}>{l.label}</option>
        {/each}
      </select>
    </label>
    <label class="demo__zone">
      Clock
      <select
        id="hour12-select"
        name="hour12"
        aria-label="Hour cycle"
        value={hour12 === undefined ? "auto" : hour12 ? "12" : "24"}
        onchange={onHour12Change}
      >
        <option value="auto">Auto</option>
        <option value="12">12-hour</option>
        <option value="24">24-hour</option>
      </select>
    </label>
  </header>

  <div class="demo__cal">
    <Calendar
      store={cal.store}
      {locale}
      {hour12}
      {onEventCreate}
      {onSelectSlot}
      {onEventClick}
    />
  </div>
</div>
