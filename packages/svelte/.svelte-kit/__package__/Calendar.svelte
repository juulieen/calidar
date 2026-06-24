<script lang="ts">
  import type {
    CalendarOptions,
    CalendarStore,
    ResourceViewModel,
    TimeGridViewModel,
    TimelineUnit,
    TimelineViewModel,
  } from "@calidar/core";
  import {
    computeView,
    computeResourceView,
    computeTimelineView,
    addDays,
    addMonths,
    startOfDayEpoch,
    epochToPlainDate,
  } from "@calidar/core";
  import { createCalendarState } from "./calendarState.svelte.js";
  import { createFormatters } from "./format.js";
  import type { CalendarCallbacks } from "./types.js";
  import Toolbar from "./Toolbar.svelte";
  import TimeGridView from "./TimeGridView.svelte";
  import MonthView from "./MonthView.svelte";
  import InfiniteAgendaView from "./InfiniteAgendaView.svelte";
  import ResourcesView from "./ResourcesView.svelte";
  import TimelineView from "./TimelineView.svelte";

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
    onRecurringEdit,
    responsive = true,
    locale,
    hour12,
  }: Props = $props();

  // Presentation-only formatters bound to the locale/hour12 props.
  const formatters = $derived(createFormatters(locale, hour12));

  // Resolve the calendar exactly once during init.
  // svelte-ignore state_referenced_locally
  const cal = createCalendarState(externalStore ?? options ?? {});

  const callbacks = $derived<CalendarCallbacks>({
    onEventCreate,
    onEventUpdate,
    onEventClick,
    onSelectSlot,
    onRecurringEdit,
  });

  const snapshot = $derived(cal.snapshot);

  let rootEl: HTMLDivElement | undefined = $state();

  // ---- Adapter-local modes (not store views) ------------------------------
  // Resources mode: a per-resource grid for the focal day. Auto-clears if the
  // calendar ends up with no resources to show.
  let resourceMode = $state(false);
  const hasResources = $derived(snapshot.state.resources.length > 0);
  const resourcesActive = $derived(resourceMode && hasResources);

  // Timeline mode: a horizontal time axis with resources as rows. Never mutates
  // `store.view`; we render a separate view model when active.
  let timelineActive = $state(false);
  let timelineUnit = $state<TimelineUnit>("day");

  const resourceView = $derived.by<ResourceViewModel | null>(() => {
    if (!resourcesActive) return null;
    return computeResourceView(snapshot.state, snapshot.events, snapshot.now);
  });

  const timelineView = $derived.by<TimelineViewModel | null>(() => {
    if (!timelineActive) return null;
    return computeTimelineView(
      snapshot.state,
      snapshot.events,
      { unit: timelineUnit },
      snapshot.now,
    );
  });

  function setResourceMode(on: boolean): void {
    resourceMode = on;
  }
  function setTimelineActive(on: boolean): void {
    timelineActive = on;
  }
  function setTimelineUnit(unit: TimelineUnit): void {
    // Selecting an explicit unit also activates the timeline.
    timelineUnit = unit;
    timelineActive = true;
  }

  // ---- Responsive measurement ---------------------------------------------
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

  // Compact applies only to the time-grid views (week/days) on a narrow screen
  // and only when no local mode is active.
  const compact = $derived.by(() => {
    if (!responsive || resourcesActive || timelineActive) return false;
    if (rootWidth === 0 || rootWidth >= 640) return false;
    const v = snapshot.state.view;
    return v === "week" || v === "days";
  });

  const compactDays = $derived(rootWidth < 480 ? 1 : 3);

  const effectiveTimeGrid = $derived.by<TimeGridViewModel | null>(() => {
    if (!compact) return null;
    const snap = snapshot;
    const vm = computeView(
      { ...snap.state, view: "days", visibleDays: compactDays },
      snap.events,
      snap.now,
    );
    return vm as TimeGridViewModel;
  });

  // ---- Navigation ---------------------------------------------------------
  function shiftCursorDays(n: number): void {
    const tz = snapshot.state.timeZone;
    const date = epochToPlainDate(snapshot.state.cursor, tz);
    const target = addDays(date, n);
    cal.store.setCursor(startOfDayEpoch(target, tz) + 12 * 3_600_000);
  }

  // Step the cursor by one rendered period. Resources/Timeline navigate by their
  // own unit; compact steps by N days; otherwise the store's view-sized step.
  function stepPeriod(dir: 1 | -1): void {
    if (resourcesActive) {
      shiftCursorDays(dir);
      return;
    }
    if (timelineActive) {
      const tz = snapshot.state.timeZone;
      const date = epochToPlainDate(snapshot.state.cursor, tz);
      const target =
        timelineUnit === "day"
          ? addDays(date, dir)
          : timelineUnit === "week"
            ? addDays(date, dir * 7)
            : addMonths(date, dir);
      cal.store.setCursor(startOfDayEpoch(target, tz) + 12 * 3_600_000);
      return;
    }
    if (compact) {
      shiftCursorDays(dir * compactDays);
    } else if (dir < 0) {
      cal.store.prev();
    } else {
      cal.store.next();
    }
  }

  const onPrev = $derived(() => stepPeriod(-1));
  const onNext = $derived(() => stepPeriod(1));

  // Title days reflect the compact range actually on screen. Null otherwise.
  const titleDays = $derived(
    compact ? (effectiveTimeGrid?.days.map((d) => d.date) ?? null) : null,
  );

  // Roll the "now"-dependent state over when the day changes (cheap interval).
  $effect(() => {
    const id = setInterval(() => cal.store.refresh(), 5 * 60_000);
    return () => clearInterval(id);
  });

  // Minimal keyboard nav: arrows = period, "t" = today.
  function onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (!rootEl || !target || !rootEl.contains(target)) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    if (e.key === "ArrowLeft") {
      stepPeriod(-1);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      stepPeriod(1);
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
  <Toolbar
    store={cal.store}
    {snapshot}
    {onPrev}
    {onNext}
    {titleDays}
    {formatters}
    {resourcesActive}
    {resourceView}
    onResourceMode={setResourceMode}
    {timelineActive}
    {timelineUnit}
    onTimelineActive={setTimelineActive}
    onTimelineUnit={setTimelineUnit}
  />

  <div class="cal-body">
    {#if resourceView}
      <ResourcesView
        store={cal.store}
        view={resourceView}
        now={snapshot.now}
        {callbacks}
        {formatters}
      />
    {:else if timelineView}
      <TimelineView
        store={cal.store}
        view={timelineView}
        now={snapshot.now}
        {callbacks}
        {formatters}
      />
    {:else if snapshot.view.kind === "month"}
      <MonthView store={cal.store} view={snapshot.view} {callbacks} {formatters} />
    {:else if snapshot.view.kind === "agenda"}
      <InfiniteAgendaView {snapshot} {callbacks} {formatters} />
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
