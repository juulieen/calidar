# @calidar/vue

Vue 3 adapter for [Calidar](../../README.md) — a headless, MIT, zero-dependency
calendar with Google/Outlook-style UX. Built on [`@calidar/core`](../core).

```bash
npm i @calidar/vue @calidar/core vue
```

```vue
<script setup lang="ts">
import { Calendar } from "@calidar/vue";
import "@calidar/vue/styles.css";

const events = [
  { id: "1", title: "Standup", start: "2026-06-22T09:30", end: "2026-06-22T09:45",
    rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" },
  { id: "2", title: "Conf", start: "2026-06-24", end: "2026-06-26", allDay: true },
];
</script>

<template>
  <Calendar
    :options="{ view: 'week', timeZone: 'Europe/Paris', weekStartsOn: 1, events }"
    :on-event-update="(id, patch) => console.log('moved/resized', id, patch)"
    :on-event-create="(draft) => console.log('created', draft)"
  />
</template>
```

## Features

Feature parity with the React/Svelte adapters: 5 views (day / N-day / week /
month / agenda), drag/resize/create on timed **and** all-day **and** month
bands, recurring-occurrence editing (this / this-and-following / all) via a
themed scope dialog, the "Quiet Ink" theme with automatic dark mode, and a
responsive compact view on phones — all driven by the agnostic core.

## Exports

- `Calendar` — the root component (props: `options` or `store`, callbacks
  `onEventCreate` / `onEventUpdate` / `onEventClick` / `onSelectSlot` /
  `onRecurringEdit`, plus `responsive`).
- `useCalendar(options | store)` — composable returning the store + a reactive
  snapshot.
- Sub-components (`CalendarToolbar`, `TimeGridView`, `MonthView`, `AgendaView`)
  and the core types are re-exported.

Override any `--cal-*` CSS variable on the `.calidar` root to retheme.

## License

MIT
