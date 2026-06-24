<script lang="ts">
  import type {
    CalendarStore,
    CalendarSnapshot,
    CalendarViewKind,
    PlainDate,
    ResourceViewModel,
    TimelineUnit,
  } from "@calidar/core";
  import { epochToPlainDate, startOfWeek } from "@calidar/core";
  import { createFormatters, type Formatters } from "./format.js";

  interface Props {
    store: CalendarStore;
    snapshot: CalendarSnapshot;
    /** Previous-period handler. Defaults to the store's view-sized step. */
    onPrev?: () => void;
    /** Next-period handler. Defaults to the store's view-sized step. */
    onNext?: () => void;
    /**
     * When the parent renders a compact day-window (responsive phone mode),
     * the days actually on screen. The title then reflects this real range
     * instead of the underlying Week state. Null/empty = use the store state.
     */
    titleDays?: PlainDate[] | null;
    /** Locale-bound formatters (defaults to the runtime locale when omitted). */
    formatters?: Formatters;

    // ---- Adapter-local modes (not store views) ----
    /** True while the Resources mode is active (overrides the store view). */
    resourcesActive?: boolean;
    /** The resources view model while the mode is active, else null. */
    resourceView?: ResourceViewModel | null;
    /** Toggle the Resources mode. */
    onResourceMode?: (on: boolean) => void;
    /** True while the Timeline mode is active. */
    timelineActive?: boolean;
    /** Current Timeline axis unit. */
    timelineUnit?: TimelineUnit;
    /** Toggle the Timeline mode on/off. */
    onTimelineActive?: (on: boolean) => void;
    /** Choose the Timeline axis unit (also activates the mode). */
    onTimelineUnit?: (unit: TimelineUnit) => void;
  }
  const {
    store,
    snapshot,
    onPrev,
    onNext,
    titleDays = null,
    formatters = createFormatters(),
    resourcesActive = false,
    resourceView = null,
    onResourceMode,
    timelineActive = false,
    timelineUnit = "day",
    onTimelineActive,
    onTimelineUnit,
  }: Props = $props();

  const views: { kind: CalendarViewKind; label: string }[] = [
    { kind: "day", label: "Day" },
    { kind: "days", label: "3 days" },
    { kind: "week", label: "Week" },
    { kind: "month", label: "Month" },
    { kind: "agenda", label: "Agenda" },
  ];

  const TIMELINE_UNITS: { label: string; unit: TimelineUnit }[] = [
    { label: "Day", unit: "day" },
    { label: "Week", unit: "week" },
    { label: "Month", unit: "month" },
  ];

  const hasResources = $derived(snapshot.state.resources.length > 0);

  // Compute the title from what's actually rendered.
  const title = $derived.by(() => {
    const { formatRangeTitle } = formatters;
    const { state } = snapshot;
    const tz = state.timeZone;
    const cursorDate = epochToPlainDate(state.cursor, tz);

    if (resourceView) {
      return formatRangeTitle("day", resourceView.date, 1);
    }
    if (timelineActive) {
      if (timelineUnit === "day") return formatRangeTitle("day", cursorDate, 1);
      if (timelineUnit === "month") return formatRangeTitle("month", cursorDate, 0);
      const first = startOfWeek(cursorDate, state.weekStartsOn);
      return formatRangeTitle("week", first, 7);
    }
    // Compact mode: title follows the days the parent is actually rendering.
    if (titleDays && titleDays.length > 0) {
      const first = titleDays[0]!;
      const count = titleDays.length;
      return formatRangeTitle(count === 1 ? "day" : "days", first, count);
    }
    switch (state.view) {
      case "day":
        return formatRangeTitle("day", cursorDate, 1);
      case "days":
        return formatRangeTitle("days", cursorDate, Math.max(1, state.visibleDays));
      case "week":
        return formatRangeTitle("week", startOfWeek(cursorDate, state.weekStartsOn), 7);
      case "month":
        return formatRangeTitle("month", cursorDate, 1);
      case "agenda":
        // Infinite agenda is centred on the cursor: label it by the cursor month.
        return formatRangeTitle("month", cursorDate, 0);
    }
  });

  function selectView(kind: CalendarViewKind): void {
    // Leaving a local mode hands control back to the store view.
    onResourceMode?.(false);
    onTimelineActive?.(false);
    if (kind === "days") store.setVisibleDays(3);
    store.setView(kind);
  }

  const isViewActive = (kind: CalendarViewKind): boolean =>
    !resourcesActive && !timelineActive && snapshot.state.view === kind;

  const prev = (): void => (onPrev ? onPrev() : store.prev());
  const next = (): void => (onNext ? onNext() : store.next());
</script>

<div class="cal-toolbar" role="toolbar" aria-label="Calendar navigation">
  <div class="cal-toolbar__nav">
    <button type="button" class="cal-btn" onclick={() => store.today()}>Today</button>
    <button
      type="button"
      class="cal-btn cal-btn--icon"
      aria-label="Previous period"
      onclick={prev}>‹</button
    >
    <button
      type="button"
      class="cal-btn cal-btn--icon"
      aria-label="Next period"
      onclick={next}>›</button
    >
    <h2 class="cal-toolbar__title">{title}</h2>
  </div>

  <div class="cal-toolbar__views" role="group" aria-label="View selector">
    {#each views as v (v.kind)}
      <button
        type="button"
        class="cal-btn cal-view-btn"
        class:cal-view-btn--active={isViewActive(v.kind)}
        aria-pressed={isViewActive(v.kind)}
        onclick={() => selectView(v.kind)}
      >
        {v.label}
      </button>
    {/each}

    {#if hasResources}
      <button
        type="button"
        class="cal-btn cal-view-btn"
        class:cal-view-btn--active={resourcesActive}
        aria-pressed={resourcesActive}
        aria-label="Resources"
        onclick={() => {
          onTimelineActive?.(false);
          onResourceMode?.(true);
        }}
      >
        Resources
      </button>
    {/if}

    <button
      type="button"
      class="cal-btn cal-view-btn"
      class:cal-view-btn--active={timelineActive}
      aria-pressed={timelineActive}
      aria-label="Timeline"
      onclick={() => {
        onResourceMode?.(false);
        onTimelineActive?.(!timelineActive);
      }}
    >
      Timeline
    </button>
  </div>

  <!-- Timeline axis-granularity sub-selector (only while Timeline is on). -->
  {#if timelineActive}
    <div class="cal-toolbar__units" role="group" aria-label="Timeline unit">
      {#each TIMELINE_UNITS as u (u.unit)}
        <button
          type="button"
          class="cal-btn cal-view-btn"
          class:cal-view-btn--active={timelineUnit === u.unit}
          aria-pressed={timelineUnit === u.unit}
          aria-label={`Timeline ${u.label}`}
          onclick={() => onTimelineUnit?.(u.unit)}
        >
          {u.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
