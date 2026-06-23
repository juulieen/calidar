<script lang="ts">
  import type {
    CalendarStore,
    MonthViewModel,
    MonthWeekModel,
    EventInstance,
  } from "@calidar/core";
  import type { CalendarCallbacks, RecurringEditScope } from "./types.js";
  import {
    DayDragController,
    type DayCommit,
    type DayMetrics,
  } from "./dayDrag.svelte.js";
  import {
    routeCommit,
    applyRecurringEdit,
    type EditBounds,
  } from "./recurringEdit.js";
  import RecurringScopeDialog from "./RecurringScopeDialog.svelte";
  import { formatWeekdayShort } from "./format.js";

  interface Props {
    store: CalendarStore;
    view: MonthViewModel;
    callbacks: CalendarCallbacks;
  }
  const { store, view, callbacks }: Props = $props();

  const MAX_LANES = 3; // visible band lanes before collapsing to "+N"
  const LANE_H = 20;

  // Weekday header derived from the first week.
  const weekdays = $derived(view.weeks[0]?.days.map((d) => d.date) ?? []);

  function bandStyle(band: MonthWeekModel["bands"][number]): string {
    const left = (band.startCol / 7) * 100;
    const width = ((band.endCol - band.startCol + 1) / 7) * 100;
    const top = band.lane * (LANE_H + 2);
    return `left:calc(${left}% + 2px);width:calc(${width}% - 4px);top:${top}px;height:${LANE_H}px;`;
  }

  // ---- Day-snapping drag (move bands across days + drag-create) ------------
  // Flatten the grid into a single left→right, top→bottom day list so a gesture
  // can span week rows.
  let gridEl: HTMLDivElement | undefined = $state();
  const flatDays = $derived(view.weeks.flatMap((w) => w.days));

  const dayMetrics = (): DayMetrics => ({
    dayStarts: flatDays.map((d) => d.dayStart),
    dayEnds: flatDays.map((d) => d.dayEnd),
  });

  /** Resolve a flat day index from pointer coords using the grid geometry. */
  function dayAt(clientX: number, clientY: number): number {
    if (!gridEl || view.weeks.length === 0) return -1;
    const rect = gridEl.getBoundingClientRect();
    const cols = 7;
    const rows = view.weeks.length;
    const colW = rect.width / cols;
    const rowH = rect.height / rows;
    if (colW <= 0 || rowH <= 0) return -1;
    const col = Math.floor((clientX - rect.left) / colW);
    const row = Math.floor((clientY - rect.top) / rowH);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return -1;
    return row * cols + col;
  }

  /** Flat index → [weekIndex, colIndex]. */
  function flatToWeekCol(flat: number): { wi: number; col: number } {
    return { wi: Math.floor(flat / 7), col: flat % 7 };
  }

  /**
   * The band instance's TRUE span as flat grid-day indices, regardless of which
   * week row it's currently rendered on. A band can continue before/after a row,
   * so resize pivots must use the full span (clamped to the visible grid).
   */
  function bandFlatSpan(instance: EventInstance): { start: number; end: number } {
    let start = -1;
    let end = -1;
    for (let i = 0; i < flatDays.length; i++) {
      const d = flatDays[i]!;
      if (instance.start < d.dayEnd && instance.end > d.dayStart) {
        if (start < 0) start = i;
        end = i;
      }
    }
    return { start, end };
  }

  const drag = new DayDragController({
    metrics: dayMetrics,
    dayAt,
    onCommit(c: DayCommit) {
      if (c.instance) {
        commitEdit(c.instance, c.instance.start, { start: c.start, end: c.end });
      } else {
        callbacks.onEventCreate?.({ start: c.start, end: c.end, allDay: true });
      }
    },
    onClick(a) {
      if (a.instance) {
        callbacks.onEventClick?.(a.instance);
      } else {
        // A plain tap on an empty cell → select that single day.
        const day = flatDays[a.startDay];
        if (day) selectDay(day.dayStart, day.dayEnd);
      }
    },
  });

  function onCellPointerDown(e: PointerEvent, flat: number): void {
    if (e.button !== 0) return;
    drag.startCreate(e, flat);
  }

  function onBandPointerDown(
    e: PointerEvent,
    wi: number,
    band: MonthWeekModel["bands"][number],
    mode: "move" | "resize-start" | "resize-end",
  ): void {
    if (e.button !== 0) return;
    // Use the band's TRUE grid-wide span (across week rows) as the gesture
    // origin so resizing an end whose start lives on an earlier row keeps that
    // start, and vice-versa. Falls back to this row's visible segment.
    const span = bandFlatSpan(band.instance);
    const startFlat = span.start >= 0 ? span.start : wi * 7 + band.startCol;
    const endFlat = span.end >= 0 ? span.end : wi * 7 + band.endCol;
    const grab = dayAt(e.clientX, e.clientY);
    drag.startBand(
      e,
      band.instance,
      mode,
      startFlat,
      endFlat,
      grab < 0 ? startFlat : grab,
    );
  }

  // Live ghost segments (one per week row the preview crosses).
  const ghostSegments = $derived.by(() => {
    const a = drag.active;
    if (!a) return [];
    const segs: { wi: number; left: number; width: number }[] = [];
    const start = flatToWeekCol(a.startDay);
    const end = flatToWeekCol(a.endDay);
    for (let wi = start.wi; wi <= end.wi; wi++) {
      const c0 = wi === start.wi ? start.col : 0;
      const c1 = wi === end.wi ? end.col : 6;
      segs.push({
        wi,
        left: (c0 / 7) * 100,
        width: ((c1 - c0 + 1) / 7) * 100,
      });
    }
    return segs;
  });

  // ---- Recurring scope flow ------------------------------------------------
  interface PendingRecurring {
    instance: EventInstance;
    occurrenceStart: number;
    patch: EditBounds;
  }
  let pending = $state<PendingRecurring | null>(null);

  function commitEdit(
    instance: EventInstance,
    occurrenceStart: number,
    patch: EditBounds,
  ): void {
    const req = routeCommit(
      store,
      callbacks,
      instance,
      occurrenceStart,
      patch,
      view.timeZone,
    );
    if (req) pending = req;
  }

  function onScopeChoose(scope: RecurringEditScope): void {
    const p = pending;
    pending = null;
    if (!p) return;
    applyRecurringEdit(
      store,
      callbacks,
      p.instance,
      p.occurrenceStart,
      p.patch,
      scope,
      view.timeZone,
    );
  }

  function onScopeCancel(): void {
    pending = null;
  }

  /** Count bands overflowing a given day column beyond MAX_LANES. */
  function overflowFor(week: MonthWeekModel, col: number): number {
    let n = 0;
    for (const b of week.bands) {
      if (b.lane >= MAX_LANES && b.startCol <= col && col <= b.endCol) n++;
    }
    return n;
  }

  function openDay(dayStart: number): void {
    store.setCursor(dayStart + 12 * 3_600_000);
    store.setView("day");
  }

  function selectDay(dayStart: number, dayEnd: number): void {
    callbacks.onSelectSlot?.({ start: dayStart, end: dayEnd, allDay: true });
  }
</script>

<div class="cal-month">
  <div class="cal-month__weekdays">
    {#each weekdays as d (d.day)}
      <div class="cal-month__weekday">{formatWeekdayShort(d)}</div>
    {/each}
  </div>

  <div class="cal-month__grid" bind:this={gridEl}>
    {#each view.weeks as week, wi (wi)}
      <div class="cal-month__week">
        <!-- Day cells -->
        <div class="cal-month__days">
          {#each week.days as day, col (day.dayStart)}
            <div
              class="cal-month__cell"
              class:cal-month__cell--out={!day.inMonth}
              class:cal-month__cell--weekend={day.isWeekend}
              class:cal-month__cell--today={day.isToday}
              role="button"
              tabindex="0"
              onpointerdown={(e) => onCellPointerDown(e, wi * 7 + col)}
              ondblclick={() => openDay(day.dayStart)}
              onkeydown={(e) => {
                if (e.key === "Enter") openDay(day.dayStart);
              }}
            >
              <span class="cal-month__num" class:cal-month__num--today={day.isToday}>
                {day.date.day}
              </span>
            </div>
          {/each}
        </div>

        <!-- Bands overlaying the week row -->
        <div class="cal-month__bands">
          {#each week.bands as band (band.instance.key)}
            {#if band.lane < MAX_LANES}
              {@const editable = band.instance.editable !== false}
              <div
                class="cal-band cal-band--month"
                class:cal-band--cont-before={band.continuesBefore}
                class:cal-band--cont-after={band.continuesAfter}
                class:cal-band--readonly={!editable}
                style={bandStyle(band) +
                  (band.instance.color ? `--cal-event-color:${band.instance.color};` : "")}
                title={band.instance.title}
                role="button"
                tabindex="0"
                onpointerdown={(e) => onBandPointerDown(e, wi, band, "move")}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    callbacks.onEventClick?.(band.instance);
                }}
              >
                {#if editable}
                  <div
                    class="cal-band__handle cal-band__handle--start"
                    role="presentation"
                    onpointerdown={(e) =>
                      onBandPointerDown(e, wi, band, "resize-start")}
                  ></div>
                {/if}
                <span class="cal-band__title">{band.instance.title}</span>
                {#if editable}
                  <div
                    class="cal-band__handle cal-band__handle--end"
                    role="presentation"
                    onpointerdown={(e) =>
                      onBandPointerDown(e, wi, band, "resize-end")}
                  ></div>
                {/if}
              </div>
            {/if}
          {/each}

          <!-- Drag ghost segment for this week row -->
          {#each ghostSegments as seg (seg.wi)}
            {#if seg.wi === wi}
              <div
                class="cal-band cal-band--month cal-band--ghost"
                style={`left:calc(${seg.left}% + 2px);width:calc(${seg.width}% - 4px);top:0px;height:${LANE_H}px;`}
              ></div>
            {/if}
          {/each}

          <!-- Overflow "+N" per column -->
          {#each week.days as day, col (day.dayStart)}
            {@const extra = overflowFor(week, col)}
            {#if extra > 0}
              <button
                type="button"
                class="cal-month__more"
                style={`left:calc(${(col / 7) * 100}% + 2px);width:calc(${100 / 7}% - 4px);top:${MAX_LANES * (LANE_H + 2)}px`}
                onclick={() => openDay(day.dayStart)}
              >
                +{extra}
              </button>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  </div>

  {#if pending}
    <RecurringScopeDialog onChoose={onScopeChoose} onCancel={onScopeCancel} />
  {/if}
</div>
