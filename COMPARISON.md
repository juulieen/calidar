# Calidar vs. existing calendar libraries

An honest landscape of JavaScript calendar/scheduler libraries and where
Calidar fits. Pricing & status are as of **mid-2026** and change often — verify
before relying on them.

## TL;DR

The market splits into three groups:

1. **Styled, single- or multi-framework components** (FullCalendar,
   Schedule-X, react-big-calendar, Toast UI, vkurko/Event Calendar). They give
   you a UI out of the box, but you adopt *their* DOM and *their* theming
   model, and several gate drag/resize/scheduler features behind a paid tier.
2. **Commercial suites** (Mobiscroll, DayPilot Pro, Bryntum, Syncfusion).
   Extremely capable and battle-tested, but **$480–$680+/dev** and proprietary.
3. **Headless engines** — almost empty. This is where Calidar aims: the hard
   maths (timezones, recurrence, overlap layout) as an MIT, zero-dependency,
   framework-agnostic core, with thin adapters you can replace or reskin.

## Feature & licensing matrix

| | **Calidar** | FullCalendar | Schedule-X | react-big-calendar | Toast UI Calendar | Event Calendar (vkurko) | Commercial (Mobiscroll/DayPilot/Bryntum/Syncfusion) |
|---|---|---|---|---|---|---|---|
| **License** | MIT (everything) | MIT core; **Scheduler/Resource/Timeline = paid** ($480+/dev/yr) | MIT core; **drag-drop & resize moved to Premium in v4** | MIT | MIT | MIT | Proprietary, **$480–$680+/dev** |
| **Architecture** | **Headless engine + adapters** | Styled, vanilla + framework connectors | Styled, agnostic w/ adapters | Styled, React-only | Styled, vanilla (+ deprecated wrappers) | Styled, Svelte-based | Styled component suites |
| **Frameworks** | **React, Svelte, Vue, Solid** (core is agnostic) | React, Vue, Angular, vanilla | React, Vue, Angular, Svelte, Preact | React only | Vanilla; React/Vue wrappers deprecated→monorepo | Svelte, + JS/React/Vue wrappers | React/Angular/Vue/JS |
| **Runtime deps** | **Zero** | Several | Migrating to Temporal | date lib adapter required | Several | Zero | Many |
| **Timezones** | **Native `Intl`, DST-correct, built-in** | Via plugin (moment-timezone/luxon) | Temporal-based (v4+) | **DIY** via custom accessors | Limited | Limited | Built-in |
| **Recurrence (RRULE)** | **Built-in, windowed — incl. BYSETPOS/BYYEARDAY/BYWEEKNO, EXDATE, RDATE, occurrence editing** | Via `rrule` plugin | Yes | **DIY** | Limited | Limited | Built-in |
| **Drag / resize / create** | **Built-in, MIT** — timed + all-day + month bands, Pointer Events | Yes (interaction plugin) | **Premium (v4)** | Add-on; can't drag across months | Yes | Yes | Yes |
| **Views** | Day, N-day, Week, Month, Agenda (virtualised/infinite), **Resources**, **Timeline** | Day/Week/Month/List/Timeline\* | Day/Week/Month | Month/Week/Day/Agenda | Month/Week/Day | Day/Week/Month/List/Resource/Timeline | All + resource/timeline |
| **Resource columns** | **✅ MIT** (per-resource day columns; all 4 adapters) | ✅ (premium) | ✅ (premium) | ❌ | partial | ✅ | ✅ |
| **Resource timeline** | **✅ MIT** (resources as rows, horizontal axis: day/week/month; all 4 adapters) | ✅ (premium) | ✅ (premium) | ❌ | ❌ | ✅ | ✅ |
| **i18n** | **`Intl` locale + `hour12` + `weekStartsOn`** | ✅ | ✅ | basic | ✅ | ✅ | ✅ |
| **Theming** | Headless + `--cal-*` CSS vars | Theme system | Light/dark + themeable | One default theme, SASS vars | Themeable | Themeable | Themeable |
| **Maturity** | **New / unproven** | Very mature, huge ecosystem | Active, growing | Mature but limited | Maintenance-mode-ish; wrappers deprecated | Active (Svelte 5 runes, late 2025) | Very mature, supported |
| **Bundle (core)** | ~29 KB, 0 dep | Larger | Modular | Medium + date lib | Medium | Small | Large |

\* FullCalendar's Timeline/Resource views are premium.

> **Status note.** The feature set above reflects Calidar with all current PRs
> merged (4 adapters, full RRULE, RDATE, occurrence editing, resource columns,
> resource timeline, virtualised agenda, i18n). Resource columns, the resource
> timeline and the virtualised agenda ship across **all four adapters** (React,
> Svelte, Vue, Solid) — see the [live demos](https://juulieen.github.io/calidar/).
> Gantt-style timelines (dependencies, swimlanes) remain out of scope.

## Where Calidar is differentiated

- **Truly headless + agnostic — and proven across 4 frameworks.** FullCalendar
  and Schedule-X are multi-framework but ship a fixed UI; react-big-calendar and
  Event Calendar are tied to one framework. Calidar's core renders nothing and
  exposes a `subscribe`/`getSnapshot` contract; **React, Svelte, Vue and Solid
  adapters** all run on the same engine and look pixel-identical. You can fully
  restyle (or write a new adapter) without forking.
- **No paywall on the essentials.** Drag/resize/create — on timed, all-day
  **and** month bands — plus recurrence, timezones, **resource columns** and a
  **resource timeline** are exactly what people hit a paywall for: FullCalendar's
  scheduler/resource/timeline views are premium, Bryntum/DayPilot charge per dev,
  and **Schedule-X moved drag-and-drop & resize to Premium in v4 (2026)**.
  Calidar keeps all of it MIT.
- **Complete-enough RRULE, zero deps.** FREQ/INTERVAL/COUNT/UNTIL, BYDAY (incl.
  `3MO`/`-1FR`), BYMONTHDAY, BYMONTH, **BYSETPOS, BYYEARDAY, BYWEEKNO**, plus
  EXDATE/RDATE and "this / this-and-following / all" occurrence editing — without
  pulling in the `rrule` library or a Temporal polyfill.
- **`Intl`-native timezones.** Wall-clock times re-project per occurrence, so
  recurring meetings stay correct across DST.
- **Performance by construction.** Windowed recurrence expansion (only the
  visible range is materialised), memoised snapshots, and a **virtualised,
  infinitely-scrollable agenda** with bounded DOM.

## Where the alternatives still win (be honest)

- **Maturity & edge cases.** FullCalendar, Toast UI and the commercial suites
  have years of bug-fixing, accessibility passes, docs and Stack Overflow
  answers. Calidar is new and unproven.
- **Gantt / advanced scheduling.** Resource *columns* and a resource *timeline*
  (resources as rows, horizontal day/week/month axis) now exist (MIT), but
  Gantt-style dependencies, swimlanes and constraint solving are still the
  domain of Bryntum/DayPilot/Syncfusion/FullCalendar-premium.
- **Support.** Commercial suites come with SLAs and paid support. Calidar is
  community/best-effort.
- **Ecosystem.** Plugins, themes, integrations — the incumbents have them.

## Closest spiritual sibling

**vkurko/Event Calendar** is the nearest in philosophy: MIT, zero-dependency,
lightweight, Svelte 5 runes, actively maintained. The key difference is
architecture — it's a *Svelte component*, whereas Calidar is a *framework-agnostic
engine* with Svelte being one of several possible skins. If you only ever use
Svelte and want something proven today, Event Calendar is a strong choice;
Calidar bets on the headless/portable angle and on keeping drag/resize free.

## Honest recommendation

- **Need it in production this week, budget is fine** → a commercial suite or
  FullCalendar Premium.
- **React-only, simple needs, free** → react-big-calendar or FullCalendar MIT.
- **Multi-framework, want polish now** → Schedule-X (mind the v4 premium split).
- **Want a headless engine you fully control, all features MIT, and you're
  willing to be an early adopter** → Calidar.

## Sources

- [FullCalendar — Pricing](https://fullcalendar.io/pricing) · [License](https://fullcalendar.io/license)
- [Schedule-X — GitHub](https://github.com/schedule-x/schedule-x) · [site](https://schedule-x.dev/) · [blog (v4 premium split, Temporal)](https://schedule-x.dev/blog)
- [react-big-calendar — GitHub](https://github.com/jquense/react-big-calendar) · [npm](https://www.npmjs.com/package/react-big-calendar)
- [Toast UI Calendar — GitHub](https://github.com/nhn/tui.calendar) · [React wrapper (deprecated)](https://github.com/nhn/toast-ui.react-calendar)
- [Event Calendar (vkurko) — GitHub](https://github.com/vkurko/calendar) · [changelog (Svelte 5 runes)](https://github.com/vkurko/calendar/blob/master/CHANGELOG.md)
- [Mobiscroll pricing](https://mobiscroll.com/pricing) · [DHTMLX comparison](https://dhtmlx.com/blog/best-react-scheduler-components-dhtmlx-bryntum-syncfusion-daypilot-fullcalendar/) · [Bryntum comparison](https://bryntum.com/blog/the-best-javascript-calendar-components/)
