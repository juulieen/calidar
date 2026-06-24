# Roadmap

## Shipped

- **Engine** — timezone-aware dates (`Intl`, DST-correct), windowed RRULE
  (FREQ/INTERVAL/COUNT/UNTIL/BYDAY incl. `3MO`/`-1FR`/BYMONTHDAY/BYMONTH/
  **BYSETPOS**/**BYYEARDAY**/**BYWEEKNO**), **EXDATE** + **RDATE**, occurrence
  editing (`editRecurringEvent`: this / this-and-following / all), overlap &
  lane layout, reactive store.
- **Adapters** — **React, Svelte, Vue, Solid** on one agnostic core, pixel-identical.
- **Views** — Day · N-day · Week · Month · Agenda · **Resources** (React) ·
  **virtualised infinite agenda** (React).
- **Interactions** — drag/move/resize/create on timed + all-day + month bands.
- **i18n** — `locale` / `hour12` / `weekStartsOn`.
- **Theme** — "Quiet Ink" with automatic dark mode, fully `--cal-*` themeable.

## Next (v2) — prioritised

### Phase 1 — Core, fully unit-testable (quick, reliable wins)

- [ ] **ICS interop** — `parseICS()` / `toICS()` for VEVENT (reusing the
      existing RRULE/EXDATE/RDATE), so calendars round-trip with Google /
      Outlook / Apple.
- [ ] **Undo / redo** — a command history on the store (`undo()` / `redo()` /
      `canUndo` / `canRedo`) around event and navigation mutations.

### Phase 2 — The flagship differentiator

- [ ] **Timeline view (MIT)** — horizontal time axis with resources as rows
      (`timelineDay` / `timelineWeek` / `timelineMonth`), event-bar packing.
      Core selector (`computeTimelineView`, unit-tested) + React rendering with
      drag/resize across the time axis. This is the feature FullCalendar /
      Bryntum / DayPilot put behind a paywall.

### Phase 3 — Finish the agnostic story

- [ ] **Adapter parity** — bring the Resources view, virtualised agenda (and,
      once shipped, the Timeline view) to **Svelte / Vue / Solid**.

### Phase 4 — Heavy-editing UX

- [ ] **Multi-select + copy / paste / delete** across events.
- [ ] **Constraints** — no-overlap, min/max duration, business hours / blocked
      ranges, configurable slot granularity (15 / 30 / 60 min).

## Out of scope (for now)

- Gantt-style **timelines with dependencies** (Bryntum/DayPilot territory).
- Print-optimised stylesheet (revisit if requested).
