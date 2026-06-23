<div align="center">

# 📅 Calidar

**A headless, framework-agnostic calendar engine with Google / Outlook-style UX.**

Timezone-correct · RRULE recurrence · drag, resize & create · responsive from phone to desktop · MIT.

[![CI](https://github.com/juulieen/calidar/actions/workflows/ci.yml/badge.svg)](https://github.com/juulieen/calidar/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

</div>

---

> **Working name.** `calidar` is a placeholder — rename the scope (`@calidar/*`) with a
> single find/replace before publishing.

## Why another calendar library?

Most calendar components ship a fixed UI and fight you the moment your design
diverges. Calidar splits the hard parts from the pretty parts:

- **`@calidar/core`** — a tiny (~29 KB, **zero dependencies**) TypeScript engine
  that does the genuinely hard work: timezone-aware date maths, RFC 5545
  recurrence expansion, overlap/lane layout, and a reactive store. It renders
  **nothing**.
- **`@calidar/react`** / **`@calidar/svelte`** — thin adapters that turn the
  engine's view models into accessible, responsive, drag-and-drop UI. Swap the
  theme, or build your own adapter, without touching the engine.

The interaction model deliberately mirrors Google Calendar and Outlook —
because that's what your users already know how to use.

## Features

| | |
|---|---|
| 🗓️ **5 views** | Day · N-day (e.g. 3-day) · Week · Month · Agenda |
| 🌍 **Timezones** | Every instant is correct across DST, built on native `Intl` — no Moment/Luxon |
| 🔁 **Recurrence** | `FREQ`, `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` (incl. `3MO`/`-1FR`), `BYMONTHDAY`, `BYMONTH`, `EXDATE`, `RDATE` |
| ✋ **Interactions** | Drag to move, resize edges, drag-to-create — Pointer Events, so mouse + touch + pen |
| 📱 **Responsive** | Touch targets ≥ 44px, mobile breakpoints, momentum scroll, `contain` for paint isolation |
| ⚡ **Performance** | Windowed recurrence expansion (only the visible range is materialised), memoised snapshots, bounded DOM |
| 🎨 **Themeable** | Headless core + a Google-like default theme driven entirely by `--cal-*` CSS variables |
| 🧩 **Agnostic core** | Build a Vue / Solid / Web Component adapter against the same `subscribe`/`getSnapshot` contract |

## Packages

| Package | Description |
|---|---|
| [`@calidar/core`](packages/core) | The engine: types, store, selectors, datetime, recurrence, layout, drag maths |
| [`@calidar/react`](packages/react) | React 18 adapter (`useSyncExternalStore`) |
| [`@calidar/svelte`](packages/svelte) | Svelte 5 (runes) adapter |
| [`examples/react-demo`](examples/react-demo) | Vite playground |
| [`examples/svelte-demo`](examples/svelte-demo) | Vite playground |

## Quick start — React

```tsx
import { Calendar } from "@calidar/react";
import "@calidar/react/styles.css";

export default function App() {
  return (
    <Calendar
      options={{
        view: "week",
        timeZone: "Europe/Paris",
        weekStartsOn: 1,
        events: [
          { id: "1", title: "Standup", start: "2026-06-22T09:30", end: "2026-06-22T09:45",
            rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" },
          { id: "2", title: "Conf", start: "2026-06-24", end: "2026-06-26", allDay: true },
        ],
      }}
      onEventUpdate={(id, patch) => console.log("moved/resized", id, patch)}
      onEventCreate={(draft) => console.log("created", draft)}
    />
  );
}
```

## Quick start — Svelte 5

```svelte
<script lang="ts">
  import { Calendar } from "@calidar/svelte";
  import "@calidar/svelte/styles.css";

  const events = [
    { id: "1", title: "Standup", start: "2026-06-22T09:30", end: "2026-06-22T09:45",
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" },
  ];
</script>

<Calendar options={{ view: "week", timeZone: "Europe/Paris", weekStartsOn: 1, events }} />
```

## Using the engine directly (any framework)

```ts
import { createCalendar } from "@calidar/core";

const cal = createCalendar({ view: "week", timeZone: "America/New_York" });

cal.subscribe(() => render(cal.getSnapshot())); // getSnapshot() is memoised
cal.addEvent({ id: "x", title: "Demo", start: "2026-06-23T14:00", end: "2026-06-23T15:00" });
cal.next();        // advance one view-sized step
cal.setView("month");

// snapshot.view is a ready-to-render, fully laid-out view model — no maths left to do.
```

The engine never imports a UI framework. An adapter is ~"map `snapshot.view` to
DOM + translate pointer pixels back into instants" — see the React/Svelte
packages as references.

## Event model

```ts
interface CalendarEvent {
  id: string;
  title: string;
  start: string | number;   // ISO ("2026-06-23T09:00"), date-only, or epoch ms
  end: string | number;     // exclusive
  allDay?: boolean;
  timeZone?: string;        // IANA; defaults to the calendar's display zone
  rrule?: string;           // "FREQ=WEEKLY;BYDAY=MO,WE"
  exdates?: (string | number)[];  // dates removed from the set
  rdates?: (string | number)[];   // extra dates added to the set
  color?: string;
  editable?: boolean;
  meta?: Record<string, unknown>;
}
```

Bare local date-times (`"2026-06-23T09:00"`) are interpreted as **wall-clock in
the event's time zone** and re-projected on every recurrence occurrence, so a
"09:00 weekly" meeting stays at 09:00 even across a DST change. Values carrying
an offset/`Z` are treated as absolute.

## Development

```bash
pnpm install
pnpm --filter @calidar/core test    # 17 unit tests (datetime, DST, recurrence, layout)
pnpm build                          # build every package
pnpm --filter react-demo dev        # http://localhost:5173
pnpm --filter svelte-demo dev       # http://localhost:5174
```

## Roadmap

- [x] In-place recurrence editing — `editRecurringEvent` ("this / this-and-following / all")
- [ ] Resource / multi-calendar columns (day view side-by-side)
- [ ] Virtualised infinite agenda
- [ ] Vue & Solid adapters
- [ ] `BYSETPOS`, `BYWEEKNO`, `BYYEARDAY`
- [ ] i18n / localized labels & first-day-of-week presets

## License

[MIT](LICENSE) © 2026
