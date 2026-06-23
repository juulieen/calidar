<script lang="ts">
  import type {
    CalendarStore,
    TimeGridViewModel,
    EventInstance,
    DragMode,
  } from "@calidar/core";
  import { GridDragController, type GridMetrics } from "./gridDrag.svelte.js";
  import {
    DayDragController,
    type DayCommit,
    type DayMetrics,
  } from "./dayDrag.svelte.js";
  import type { ActiveDrag, CalendarCallbacks } from "./types.js";
  import { routeCommit, applyRecurringEdit } from "./recurringEdit.js";
  import RecurringScopeDialog from "./RecurringScopeDialog.svelte";
  import type { EditBounds } from "./recurringEdit.js";
  import type { RecurringEditScope } from "./types.js";
  import { formatHour, formatTime, formatWeekdayShort } from "./format.js";

  interface Props {
    store: CalendarStore;
    view: TimeGridViewModel;
    now: number;
    callbacks: CalendarCallbacks;
  }
  const { store, view, now, callbacks }: Props = $props();

  const HOURS = Array.from({ length: 24 }, (_, h) => h);
  const GAP_PCT = 4; // ~horizontal gap between overlapping columns

  // Grid geometry refs.
  let gridEl: HTMLDivElement | undefined = $state();
  let scrollEl: HTMLDivElement | undefined = $state();
  // Measured scrollbar gutter width, reserved on the header / all-day rows so
  // they stay aligned with the scrollable columns.
  let scrollbarW = $state(0);

  const gridHeight = $derived(24 * view.hourHeight);

  // Pixel↔time mapping for the drag controller.
  const metrics = (): GridMetrics => ({
    hourHeight: view.hourHeight,
    dayStarts: view.days.map((d) => d.dayStart),
  });

  function gridTop(): number {
    return gridEl ? gridEl.getBoundingClientRect().top : 0;
  }

  function columnAt(clientX: number): number {
    if (!gridEl || view.days.length === 0) return 0;
    const rect = gridEl.getBoundingClientRect();
    const rel = clientX - rect.left;
    const colW = rect.width / view.days.length;
    return Math.floor(rel / colW);
  }

  const drag = new GridDragController({
    metrics,
    gridTop,
    columnAt,
    snapMinutes: 15,
    onCommit(d: ActiveDrag) {
      if (d.instance) {
        commitEdit(
          d.instance,
          d.instance.start,
          { start: d.preview.start, end: d.preview.end },
        );
      } else {
        callbacks.onEventCreate?.({
          start: d.preview.start,
          end: d.preview.end,
          allDay: false,
        });
      }
    },
    onClick(eventId, dayIndex, instant) {
      if (eventId) {
        const inst = findInstance(eventId);
        if (inst) callbacks.onEventClick?.(inst);
      } else {
        callbacks.onSelectSlot?.({
          start: instant,
          end: instant + 60 * 60_000,
          allDay: false,
        });
      }
    },
  });

  function findInstance(eventId: string): EventInstance | undefined {
    for (const day of view.days) {
      for (const t of day.timed) {
        if (t.instance.eventId === eventId) return t.instance;
      }
    }
    return undefined;
  }

  // ---- Recurring scope flow (shared by timed + all-day commits) ------------
  interface PendingRecurring {
    instance: EventInstance;
    occurrenceStart: number;
    patch: EditBounds;
  }
  let pending = $state<PendingRecurring | null>(null);

  /** Route a committed move/resize: direct, host-resolved, or open the picker. */
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
    pending = null; // revert: nothing was applied to the store.
  }

  // ---- All-day band drag (day-snapping) ------------------------------------
  let allDayLanesEl: HTMLDivElement | undefined = $state();

  const dayMetrics = (): DayMetrics => ({
    dayStarts: view.days.map((d) => d.dayStart),
    dayEnds: view.days.map((d) => d.dayEnd),
  });

  function dayAt(clientX: number): number {
    if (!allDayLanesEl || view.days.length === 0) return -1;
    const rect = allDayLanesEl.getBoundingClientRect();
    const colW = rect.width / view.days.length;
    if (colW <= 0) return -1;
    return Math.floor((clientX - rect.left) / colW);
  }

  const allDayDrag = new DayDragController({
    metrics: dayMetrics,
    dayAt: (x) => dayAt(x),
    onCommit(c: DayCommit) {
      if (c.instance) {
        commitEdit(c.instance, c.instance.start, { start: c.start, end: c.end });
      } else {
        callbacks.onEventCreate?.({ start: c.start, end: c.end, allDay: true });
      }
    },
    onClick(a) {
      if (a.instance) callbacks.onEventClick?.(a.instance);
    },
  });

  function onAllDayLanesPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const d = dayAt(e.clientX);
    if (d < 0) return;
    allDayDrag.startCreate(e, Math.min(d, view.days.length - 1));
  }

  function onBandPointerDown(
    e: PointerEvent,
    band: TimeGridViewModel["allDayBands"][number],
    mode: "move" | "resize-start" | "resize-end",
  ): void {
    if (e.button !== 0) return;
    const grab = dayAt(e.clientX);
    allDayDrag.startBand(
      e,
      band.instance,
      mode,
      band.startCol,
      band.endCol,
      grab < 0 ? band.startCol : grab,
    );
  }

  // Live ghost for the all-day band gesture, in day-index space.
  const allDayPreview = $derived.by(() => {
    const a = allDayDrag.active;
    if (!a) return null;
    const n = view.days.length;
    const left = (a.startDay / n) * 100;
    const width = ((a.endDay - a.startDay + 1) / n) * 100;
    return `left:${left}%;width:${width}%;top:2px;height:${BAND_H}px;`;
  });

  function onColumnPointerDown(e: PointerEvent, dayIndex: number): void {
    // Only start a create gesture on empty space (primary button / touch).
    if (e.button !== 0) return;
    drag.startCreate(e, dayIndex);
  }

  function onEventPointerDown(
    e: PointerEvent,
    instance: EventInstance,
    mode: DragMode,
    dayIndex: number,
  ): void {
    if (e.button !== 0) return;
    drag.startEvent(e, instance, mode, dayIndex);
  }

  // ---- Now indicator -------------------------------------------------------
  const nowTop = $derived.by(() => {
    // Position the "now" line relative to the first day it falls in.
    for (let i = 0; i < view.days.length; i++) {
      const d = view.days[i]!;
      if (now >= d.dayStart && now < d.dayEnd) {
        const frac = (now - d.dayStart) / (d.dayEnd - d.dayStart);
        return { dayIndex: i, top: frac * gridHeight };
      }
    }
    return null;
  });

  // ---- All-day band geometry ----------------------------------------------
  const BAND_H = 22;
  const allDayHeight = $derived(
    view.allDayLaneCount > 0 ? view.allDayLaneCount * (BAND_H + 2) + 4 : 0,
  );

  function bandStyle(band: TimeGridViewModel["allDayBands"][number]): string {
    const n = view.days.length;
    const left = (band.startCol / n) * 100;
    const width = ((band.endCol - band.startCol + 1) / n) * 100;
    const top = band.lane * (BAND_H + 2) + 2;
    return `left:${left}%;width:${width}%;top:${top}px;height:${BAND_H}px;`;
  }

  // ---- Timed event geometry ------------------------------------------------
  function eventStyle(
    t: TimeGridViewModel["days"][number]["timed"][number],
  ): string {
    const top = t.top * gridHeight;
    const height = Math.max(t.height * gridHeight, 14);
    const left = t.left * 100;
    const width = t.width * 100;
    return `top:${top}px;height:${height}px;left:calc(${left}% + 1px);width:calc(${width}% - ${GAP_PCT}px);`;
  }

  // Live preview while dragging a timed event / creating a slot.
  const previewStyle = $derived.by(() => {
    const a = drag.active;
    if (!a) return null;
    const dayIndex = a.dayIndex;
    const day = view.days[dayIndex];
    if (!day) return null;
    const top = ((a.preview.start - day.dayStart) / (24 * 3_600_000)) * gridHeight;
    const height = Math.max(
      ((a.preview.end - a.preview.start) / (24 * 3_600_000)) * gridHeight,
      14,
    );
    const n = view.days.length;
    const left = (dayIndex / n) * 100;
    const width = (1 / n) * 100;
    return {
      style: `top:${top}px;height:${height}px;left:calc(${left}% + 2px);width:calc(${width}% - 6px);`,
      label: `${formatTime(a.preview.start, view.timeZone)} – ${formatTime(a.preview.end, view.timeZone)}`,
    };
  });

  // ---- Auto-scroll to ~7am on mount / view change --------------------------
  $effect(() => {
    // Touch hourHeight so this re-runs when the grid resizes.
    void view.hourHeight;
    if (scrollEl) {
      scrollEl.scrollTop = 7 * view.hourHeight;
    }
  });

  // ---- Measure the scrollbar gutter ----------------------------------------
  $effect(() => {
    const el = scrollEl;
    if (!el) return;
    const measure = () => {
      scrollbarW = el.offsetWidth - el.clientWidth;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });
</script>

<div class="cal-timegrid" style={`--cal-scrollbar:${scrollbarW}px`}>
  <!-- Header: weekday labels aligned with columns -->
  <div class="cal-timegrid__header">
    <div class="cal-timegrid__gutter-head" aria-hidden="true"></div>
    <div class="cal-timegrid__heads">
      {#each view.days as day (day.dayStart)}
        <div class="cal-dayhead" class:cal-dayhead--today={day.isToday}>
          <span class="cal-dayhead__dow">{formatWeekdayShort(day.date)}</span>
          <span class="cal-dayhead__num" class:cal-dayhead__num--today={day.isToday}
            >{day.date.day}</span
          >
        </div>
      {/each}
    </div>
  </div>

  <!-- All-day band row -->
  {#if view.allDayLaneCount > 0}
    <div class="cal-allday">
      <div class="cal-allday__label">All-day</div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="cal-allday__lanes"
        style={`height:${allDayHeight}px`}
        bind:this={allDayLanesEl}
        onpointerdown={onAllDayLanesPointerDown}
      >
        {#each view.allDayBands as band (band.instance.key)}
          {@const editable = band.instance.editable !== false}
          <div
            class="cal-band cal-band--allday"
            class:cal-band--cont-before={band.continuesBefore}
            class:cal-band--cont-after={band.continuesAfter}
            class:cal-band--readonly={!editable}
            style={bandStyle(band) +
              (band.instance.color ? `--cal-event-color:${band.instance.color};` : "")}
            title={band.instance.title}
            role="button"
            tabindex="0"
            onpointerdown={(e) => onBandPointerDown(e, band, "move")}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") callbacks.onEventClick?.(band.instance);
            }}
          >
            {#if editable}
              <div
                class="cal-band__handle cal-band__handle--start"
                role="presentation"
                onpointerdown={(e) => onBandPointerDown(e, band, "resize-start")}
              ></div>
            {/if}
            <span class="cal-band__title">{band.instance.title}</span>
            {#if editable}
              <div
                class="cal-band__handle cal-band__handle--end"
                role="presentation"
                onpointerdown={(e) => onBandPointerDown(e, band, "resize-end")}
              ></div>
            {/if}
          </div>
        {/each}

        {#if allDayPreview}
          <div class="cal-band cal-band--ghost" style={allDayPreview}></div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Scrollable time grid -->
  <div class="cal-timegrid__scroll" bind:this={scrollEl}>
    <div class="cal-timegrid__body" style={`height:${gridHeight}px`}>
      <!-- Hour gutter -->
      <div class="cal-gutter" aria-hidden="true">
        {#each HOURS as h (h)}
          <div class="cal-gutter__hour" style={`height:${view.hourHeight}px`}>
            {#if h > 0}<span class="cal-gutter__label">{formatHour(h)}</span>{/if}
          </div>
        {/each}
      </div>

      <!-- Columns -->
      <div class="cal-cols" bind:this={gridEl}>
        <!-- Horizontal hour lines -->
        <div class="cal-hourlines" aria-hidden="true">
          {#each HOURS as h (h)}
            <div class="cal-hourline" style={`height:${view.hourHeight}px`}></div>
          {/each}
        </div>

        {#each view.days as day, dayIndex (day.dayStart)}
          <div
            class="cal-col"
            class:cal-col--weekend={day.isWeekend}
            class:cal-col--today={day.isToday}
            style={`width:${100 / view.days.length}%`}
            role="presentation"
            onpointerdown={(e) => onColumnPointerDown(e, dayIndex)}
          >
            {#each day.timed as t (t.instance.key)}
              {@const editable = t.instance.editable !== false}
              <div
                class="cal-event"
                class:cal-event--readonly={!editable}
                style={eventStyle(t) +
                  (t.instance.color ? `--cal-event-color:${t.instance.color};` : "")}
                title={t.instance.title}
                role="button"
                tabindex="0"
                onpointerdown={(e) => onEventPointerDown(e, t.instance, "move", dayIndex)}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") callbacks.onEventClick?.(t.instance);
                }}
              >
                <div class="cal-event__time">
                  {formatTime(t.instance.start, view.timeZone)}
                </div>
                <div class="cal-event__title">{t.instance.title}</div>
                {#if editable}
                  <div
                    class="cal-event__handle cal-event__handle--top"
                    onpointerdown={(e) =>
                      onEventPointerDown(e, t.instance, "resize-start", dayIndex)}
                    role="presentation"
                  ></div>
                  <div
                    class="cal-event__handle cal-event__handle--bottom"
                    onpointerdown={(e) =>
                      onEventPointerDown(e, t.instance, "resize-end", dayIndex)}
                    role="presentation"
                  ></div>
                {/if}
              </div>
            {/each}
          </div>
        {/each}

        <!-- Drag preview ghost -->
        {#if previewStyle}
          <div class="cal-event cal-event--ghost" style={previewStyle.style}>
            <div class="cal-event__time">{previewStyle.label}</div>
          </div>
        {/if}

        <!-- Now indicator -->
        {#if nowTop}
          <div
            class="cal-now"
            style={`top:${nowTop.top}px;left:${(nowTop.dayIndex / view.days.length) * 100}%;width:${100 / view.days.length}%`}
            aria-hidden="true"
          >
            <span class="cal-now__dot"></span>
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if pending}
    <RecurringScopeDialog onChoose={onScopeChoose} onCancel={onScopeCancel} />
  {/if}
</div>
