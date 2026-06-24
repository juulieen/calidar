# @calidar/solid

SolidJS adapter for [Calidar](../../README.md) — a headless, MIT, zero-dependency
calendar with Google/Outlook-style UX. Built on [`@calidar/core`](../core).

```bash
npm i @calidar/solid @calidar/core solid-js
```

```tsx
import { Calendar } from "@calidar/solid";
import "@calidar/solid/styles.css";

export default function App() {
  const events = [
    { id: "1", title: "Standup", start: "2026-06-22T09:30", end: "2026-06-22T09:45",
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" },
    { id: "2", title: "Conf", start: "2026-06-24", end: "2026-06-26", allDay: true },
  ];
  return (
    <Calendar
      options={{ view: "week", timeZone: "Europe/Paris", weekStartsOn: 1, events }}
      onEventUpdate={(id, patch) => console.log("moved/resized", id, patch)}
    />
  );
}
```

## Features

Feature parity with the React/Svelte/Vue adapters: 5 views (day / N-day / week /
month / agenda), drag/resize/create on timed **and** all-day **and** month
bands, recurring-occurrence editing (this / this-and-following / all) via a
themed scope dialog, the "Quiet Ink" theme with automatic dark mode, and a
responsive compact view on phones — all driven by the agnostic core, with
SolidJS fine-grained reactivity.

## Exports

- `Calendar` — the root component (props: `options` or `store`, callbacks
  `onEventCreate` / `onEventUpdate` / `onEventClick` / `onSelectSlot` /
  `onRecurringEdit`, plus `responsive`).
- `useCalendar(options | store)` — returns the store + a reactive snapshot
  accessor.
- Sub-components and the core types are re-exported.

Override any `--cal-*` CSS variable on the `.calidar` root to retheme.

## License

MIT
