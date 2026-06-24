# @calidar/core

The headless, framework-agnostic engine behind [Calidar](../../README.md).
**Zero runtime dependencies.** Renders nothing — it produces fully laid-out
view models and exposes a reactive store; adapters do the rendering.

```bash
npm i @calidar/core
```

## What's inside

| Area | Exports |
|---|---|
| **Store** | `createCalendar`, `CalendarStore` |
| **Selectors** | `computeView`, `visibleRange` (+ view-model types) |
| **Instances** | `instancesInWindow`, `parseDateValue` |
| **Datetime** | `epochToWall`, `wallToEpoch`, `epochToPlainDate`, `offsetMinutesAt`, `startOfWeek`, `addDays`, `addMonths`, `isoWeekday`, … |
| **Recurrence** | `parseRRule`, `expandRecurrence` |
| **Layout** | `layoutTimedColumns`, `layoutDayBands` |
| **Interactions** | `DragSession`, `applyDrag` |

## The store

`createCalendar(options)` returns a store with a React-friendly
`subscribe(listener) => unsubscribe` / `getSnapshot()` pair. `getSnapshot()` is
**memoised**: it returns a stable reference until state or events change, so it
plugs straight into `useSyncExternalStore` or a Svelte rune.

```ts
const cal = createCalendar({ view: "week", timeZone: "Europe/Paris", weekStartsOn: 1 });

const snap = cal.getSnapshot();
// snap = { state, events, view, range, now }
// snap.view is discriminated on `kind`: "day" | "days" | "week" | "month" | "agenda"
```

### Actions

`setView` · `setTimeZone` · `setWeekStartsOn` · `setVisibleDays` ·
`setHourHeight` · `setCursor` · `goToDate` · `today` · `next` / `prev` /
`step(n)` · `setEvents` · `addEvent` · `updateEvent(id, patch)` ·
`removeEvent(id)` · `batch(fn)` · `undo` / `redo` · `refresh`.

## Undo / redo

Event mutations are recorded on a bounded history (`historyLimit`, default 100).
`undo()` / `redo()` move through it; `snapshot.canUndo` / `snapshot.canRedo`
drive toolbar buttons. Wrap a multi-step edit (e.g. a recurrence split) in
`store.batch(() => { ... })` so it reverts in a single undo. Navigation and view
changes are **not** recorded — only event edits.

## View models

Every view model is **ready to render** — all overlap/lane geometry is already
computed as fractions (`0..1`), so an adapter only multiplies by pixel sizes.

- **Time grid** (`day`/`days`/`week`): `days[]` with `timed: TimedLayout[]`
  (`top`/`height`/`left`/`width`/`column`/`columns`), plus `allDayBands:
  DayBand[]` spanning the visible columns.
- **Month**: `weeks[]` of 7 `MonthDayModel` + lane-packed `bands`.
- **Agenda**: `sections[]` grouped by day.

## Recurrence

`expandRecurrence` is **windowed**: pass the visible `[start, end)` and it only
materialises the occurrences inside it. `COUNT`/`UNTIL` are still evaluated
against the true series. Supported: `FREQ` (DAILY/WEEKLY/MONTHLY/YEARLY),
`INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` (incl. `3MO`, `-1FR`), `BYMONTHDAY`,
`BYMONTH`, `WKST`, `EXDATE`. Unsupported parts are reported in
`parseRRule(...).unsupported` rather than throwing.

## Editing recurring events

`editRecurringEvent` computes the upserts/removals for changing one occurrence
of a series, for the usual three scopes. It is pure — apply the result yourself.

```ts
const { update, remove } = editRecurringEvent({
  event: series,              // the recurring CalendarEvent
  occurrenceStart: 1781679600000, // epoch ms of the occurrence acted on
  scope: "thisAndFollowing",  // "this" | "thisAndFollowing" | "all"
  patch: { start, end },      // moved/resized times (or title/color/...)
});
// "this"            -> master gains an EXDATE + a detached one-off event
// "thisAndFollowing"-> master capped (UNTIL/COUNT) + a new series from here
// "all"             -> the master series is shifted/patched
```

## Drag maths

`DragSession` translates a pointer instant (epoch ms) + optional horizontal
day-shift into a snapped `{ start, end }` preview, for `create` / `move` /
`resize-start` / `resize-end`. It is DOM- and pointer-type-agnostic, so the
same logic drives mouse, touch and pen.

## License

MIT
