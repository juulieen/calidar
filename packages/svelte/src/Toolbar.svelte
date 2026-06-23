<script lang="ts">
  import type { CalendarStore, CalendarSnapshot, CalendarViewKind, PlainDate } from "@calidar/core";
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
  }
  const {
    store,
    snapshot,
    onPrev,
    onNext,
    titleDays = null,
    formatters = createFormatters(),
  }: Props = $props();

  const views: { kind: CalendarViewKind; label: string }[] = [
    { kind: "day", label: "Day" },
    { kind: "days", label: "3 days" },
    { kind: "week", label: "Week" },
    { kind: "month", label: "Month" },
    { kind: "agenda", label: "Agenda" },
  ];

  // Compute the first visible day + day-count to label the current range.
  const title = $derived.by(() => {
    const { formatRangeTitle } = formatters;
    // Compact mode: title follows the days the parent is actually rendering.
    if (titleDays && titleDays.length > 0) {
      const first = titleDays[0]!;
      const count = titleDays.length;
      return formatRangeTitle(count === 1 ? "day" : "days", first, count);
    }
    const { state } = snapshot;
    const tz = state.timeZone;
    const cursor = epochToPlainDate(state.cursor, tz);
    switch (state.view) {
      case "day":
        return formatRangeTitle("day", cursor, 1);
      case "days":
        return formatRangeTitle("days", cursor, Math.max(1, state.visibleDays));
      case "week":
        return formatRangeTitle("week", startOfWeek(cursor, state.weekStartsOn), 7);
      case "month":
        return formatRangeTitle("month", cursor, 1);
      case "agenda":
        return formatRangeTitle("agenda", cursor, 30);
    }
  });

  function selectView(kind: CalendarViewKind): void {
    if (kind === "days") store.setVisibleDays(3);
    store.setView(kind);
  }

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
        class:cal-view-btn--active={snapshot.state.view === v.kind}
        aria-pressed={snapshot.state.view === v.kind}
        onclick={() => selectView(v.kind)}
      >
        {v.label}
      </button>
    {/each}
  </div>
</div>
