<script lang="ts">
  import type {
    CalendarOptions,
    CalendarStore,
    TimeGridViewModel,
  } from "@calidar/core";
  import { computeView, addDays, startOfDayEpoch, epochToPlainDate } from "@calidar/core";
  import { createCalendarState } from "./calendarState.svelte.js";
  import { createFormatters } from "./format.js";
  import type { CalendarCallbacks } from "./types.js";
  import Toolbar from "./Toolbar.svelte";
  import TimeGridView from "./TimeGridView.svelte";
  import MonthView from "./MonthView.svelte";
  import AgendaView from "./AgendaView.svelte";

  interface Props extends CalendarCallbacks {
    /** Provide options to create a store, or an existing store to share one. */
    options?: CalendarOptions;
    store?: CalendarStore;
    /**
     * Adapt the time grid to narrow containers (phone-style). When the root is
     * under 640px wide and the active view is week/days, the calendar renders a
     * compact 1–3 day window instead of squeezing 7 columns. The store is never
     * mutated, so the full Week view returns when the screen widens. Default
     * `true`; set `false` to keep the legacy fixed layout.
     */
    responsive?: boolean;
    /**
     * BCP-47 locale for all labels (weekdays, titles, times). Overrides
     * `navigator.language`. Omit to keep the host's runtime locale (default).
     */
    locale?: string;
    /**
     * Force a 12-hour (`true`) or 24-hour (`false`) clock for time labels. Omit
     * to let `Intl` pick the locale's default hour cycle (default).
     */
    hour12?: boolean;
  }
  const {
    options,
    store: externalStore,
    onEventCreate,
    onEventUpdate,
    onEventClick,
    onSelectSlot,
    responsive = true,
    locale,
    hour12,
  }: Props = $props();

  // Presentation-only formatters bound to the locale/hour12 props, threaded to
  // the toolbar and every view so a forced locale flows through all labels.
  const formatters = $derived(createFormatters(locale, hour12));

  // Resolve the calendar exactly once during init. Reading the store/options
  // here is intentional: like React's useCalendar, we never swap the store
  // after mount — use store actions to mutate state instead.
  // svelte-ignore state_referenced_locally
  const cal = createCalendarState(externalStore ?? options ?? {});

  // Callbacks stay reactive so a host can swap handlers after mount.
  const callbacks = $derived<CalendarCallbacks>({
    onEventCreate,
    onEventUpdate,
    onEventClick,
    onSelectSlot,
  });

  const snapshot = $derived(cal.snapshot);

  let rootEl: HTMLDivElement | undefined = $state();

  // ---- Responsive measurement ---------------------------------------------
  // Measured width of the root container. 0 until the observer fires.
  let rootWidth = $state(0);

  $effect(() => {
    const el = rootEl;
    if (!el || !responsive) return;
    const measure = () => {
      rootWidth = el.clientWidth;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });

  // Compact applies only to the time-grid views (week/days) on a narrow screen.
  // month/agenda/day always render as-is.
  const compact = $derived.by(() => {
    if (!responsive) return false;
    if (rootWidth === 0 || rootWidth >= 640) return false;
    const v = snapshot.state.view;
    return v === "week" || v === "days";
  });

  // 1 day under 480px, otherwise 3 — a Google-Agenda-style compact window.
  const compactDays = $derived(rootWidth < 480 ? 1 : 3);

  // Effective time-grid view model. In compact mode we recompute a "days"
  // window from the SAME snapshot without ever mutating the store, so the real
  // Week state is preserved and restored when the screen widens.
  const effectiveTimeGrid = $derived.by<TimeGridViewModel | null>(() => {
    if (!compact) return null;
    const snap = snapshot;
    const vm = computeView(
      { ...snap.state, view: "days", visibleDays: compactDays },
      snap.events,
      snap.now,
    );
    // computeView returns a TimeGridViewModel for the "days" view.
    return vm as TimeGridViewModel;
  });

  // ---- Compact navigation (shift by N days, DST-safe) ---------------------
  function shiftCursorDays(n: number): void {
    const tz = snapshot.state.timeZone;
    const date = epochToPlainDate(snapshot.state.cursor, tz);
    const target = addDays(date, n);
    cal.store.setCursor(startOfDayEpoch(target, tz) + 12 * 3_600_000);
  }

  // Toolbar nav handlers: compact steps by N days, otherwise the store's
  // view-sized prev/next.
  const onPrev = $derived(() =>
    compact ? shiftCursorDays(-compactDays) : cal.store.prev(),
  );
  const onNext = $derived(() =>
    compact ? shiftCursorDays(compactDays) : cal.store.next(),
  );

  // Pass the effective compact days to the Toolbar so the title reflects the
  // range actually on screen (e.g. "23–25 June"). Null outside compact mode.
  const titleDays = $derived(effectiveTimeGrid?.days.map((d) => d.date) ?? null);

  // Minimal keyboard nav: arrows = period, "t" = today. Scoped to when focus is
  // within the calendar root so it never hijacks the rest of the page.
  function onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (!rootEl || !target || !rootEl.contains(target)) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    if (e.key === "ArrowLeft") {
      onPrev();
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      onNext();
      e.preventDefault();
    } else if (e.key === "t" || e.key === "T") {
      cal.store.today();
      e.preventDefault();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="cal-root"
  class:cal-root--compact={compact}
  bind:this={rootEl}
  tabindex="0"
  role="application"
  aria-label="Calendar"
>
  <Toolbar store={cal.store} {snapshot} {onPrev} {onNext} {titleDays} {formatters} />

  <div class="cal-body">
    {#if snapshot.view.kind === "month"}
      <MonthView store={cal.store} view={snapshot.view} {callbacks} {formatters} />
    {:else if snapshot.view.kind === "agenda"}
      <AgendaView view={snapshot.view} now={snapshot.now} {callbacks} {formatters} />
    {:else if compact && effectiveTimeGrid}
      <TimeGridView
        store={cal.store}
        view={effectiveTimeGrid}
        now={snapshot.now}
        {callbacks}
        {formatters}
      />
    {:else}
      <TimeGridView
        store={cal.store}
        view={snapshot.view}
        now={snapshot.now}
        {callbacks}
        {formatters}
      />
    {/if}
  </div>
</div>
