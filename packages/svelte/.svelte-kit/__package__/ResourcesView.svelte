<script lang="ts">
  /**
   * Resources view — a per-resource planning grid for the focal day, in the
   * style of Google Calendar "rooms". One column per configured resource, all
   * sharing the same day. Reuses the time-grid DOM / classes (hour gutter,
   * all-day band, absolutely-positioned timed events) so the visual language
   * and scrollbar alignment match the standard views.
   *
   * This is a *local* adapter mode, not a store `view`: the root component
   * drives it and feeds the precomputed `ResourceViewModel` in.
   *
   * Interactions:
   *  - Timed move / resize / create inside a column changes the hour, exactly
   *    like the time grid (shared `GridDragController`).
   *  - Dragging a timed event onto a *different* resource column reassigns its
   *    `resourceId` in addition to any time change. The change is folded into the
   *    commit patch so recurring instances defer it until scope is confirmed.
   */
  import type {
    CalendarStore,
    EventInstance,
    DragMode,
    ResourceViewModel,
  } from "@calidar/core";
  import { GridDragController, type GridMetrics } from "./gridDrag.svelte.js";
  import type { ActiveDrag, CalendarCallbacks, RecurringEditScope } from "./types.js";
  import {
    routeCommit,
    applyRecurringEdit,
    type EditBounds,
    type ExtraPatch,
  } from "./recurringEdit.js";
  import RecurringScopeDialog from "./RecurringScopeDialog.svelte";
  import { createFormatters, type Formatters } from "./format.js";

  interface Props {
    store: CalendarStore;
    view: ResourceViewModel;
    now: number;
    callbacks: CalendarCallbacks;
    formatters?: Formatters;
  }
  const { store, view, now, callbacks, formatters = createFormatters() }: Props =
    $props();
  const { formatHour, formatTime } = $derived(formatters);

  const HOURS = Array.from({ length: 24 }, (_, h) => h);
  const GAP_PCT = 4; // ~horizontal gap between overlapping columns

  let gridEl: HTMLDivElement | undefined = $state();
  let scrollEl: HTMLDivElement | undefined = $state();
  let scrollbarW = $state(0);

  const gridHeight = $derived(24 * view.hourHeight);
  const colCount = $derived(Math.max(view.columns.length, 1));

  // Every resource column shares the focal day, so all `dayStarts` are equal.
  // The hovered column index therefore identifies the *resource* under the
  // pointer (for cross-column reassignment), while the time maths is identical
  // to the standard grid.
  const metrics = (): GridMetrics => ({
    hourHeight: view.hourHeight,
    dayStarts: view.columns.map((c) => c.dayStart),
  });

  function gridTop(): number {
    return gridEl ? gridEl.getBoundingClientRect().top : 0;
  }

  function columnAt(clientX: number): number {
    if (!gridEl || view.columns.length === 0) return 0;
    const rect = gridEl.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    return Math.floor(frac * view.columns.length);
  }

  // ---- Recurring scope flow ------------------------------------------------
  interface PendingRecurring {
    instance: EventInstance;
    occurrenceStart: number;
    patch: EditBounds;
    extra: ExtraPatch;
  }
  let pending = $state<PendingRecurring | null>(null);

  function commitEdit(
    instance: EventInstance,
    occurrenceStart: number,
    patch: EditBounds,
    extra: ExtraPatch = {},
  ): void {
    const req = routeCommit(
      store,
      callbacks,
      instance,
      occurrenceStart,
      patch,
      view.timeZone,
      extra,
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
      p.extra,
    );
  }

  function onScopeCancel(): void {
    pending = null;
  }

  const drag = new GridDragController({
    metrics,
    gridTop,
    columnAt,
    snapMinutes: 15,
    onCommit(d: ActiveDrag) {
      if (d.instance) {
        // Reassign the resource when the gesture lands on a different column.
        const target = view.columns[d.dayIndex]?.resource;
        const moved =
          target != null &&
          target.id !== d.instance.resourceId &&
          d.instance.editable !== false;
        commitEdit(
          d.instance,
          d.instance.start,
          { start: d.preview.start, end: d.preview.end },
          moved ? { resourceId: target!.id } : {},
        );
      } else {
        const resource = view.columns[d.dayIndex]?.resource;
        callbacks.onEventCreate?.({
          start: d.preview.start,
          end: d.preview.end,
          allDay: false,
          ...(resource ? { resourceId: resource.id } : {}),
        });
      }
    },
    onClick(eventId, dayIndex, instant) {
      if (eventId) {
        const inst = findInstance(eventId);
        if (inst) callbacks.onEventClick?.(inst);
      } else {
        const resource = view.columns[dayIndex]?.resource;
        callbacks.onSelectSlot?.({
          start: instant,
          end: instant + 30 * 60_000,
          allDay: false,
          ...(resource ? { resourceId: resource.id } : {}),
        });
      }
    },
  });

  function findInstance(eventId: string): EventInstance | undefined {
    for (const col of view.columns) {
      for (const t of col.timed) {
        if (t.instance.eventId === eventId) return t.instance;
      }
    }
    return undefined;
  }

  function onColumnPointerDown(e: PointerEvent, colIndex: number): void {
    if (e.button !== 0) return;
    drag.startCreate(e, colIndex);
  }

  function onEventPointerDown(
    e: PointerEvent,
    instance: EventInstance,
    mode: DragMode,
    colIndex: number,
  ): void {
    if (e.button !== 0) return;
    drag.startEvent(e, instance, mode, colIndex);
  }

  // ---- Timed event geometry ------------------------------------------------
  function eventStyle(
    t: ResourceViewModel["columns"][number]["timed"][number],
  ): string {
    const top = t.top * gridHeight;
    const height = Math.max(t.height * gridHeight, 14);
    const left = t.left * 100;
    const width = t.width * 100;
    return `top:${top}px;height:${height}px;left:calc(${left}% + 1px);width:calc(${width}% - ${GAP_PCT}px);`;
  }

  // Live preview while dragging / creating, scoped to the hovered column.
  const previewStyle = $derived.by(() => {
    const a = drag.active;
    if (!a) return null;
    const col = view.columns[a.dayIndex];
    if (!col) return null;
    const dayMs = col.dayEnd - col.dayStart;
    const top = ((a.preview.start - col.dayStart) / dayMs) * gridHeight;
    const height = Math.max(
      ((a.preview.end - a.preview.start) / dayMs) * gridHeight,
      14,
    );
    const left = (a.dayIndex / colCount) * 100;
    const width = (1 / colCount) * 100;
    return {
      style: `top:${top}px;height:${height}px;left:calc(${left}% + 2px);width:calc(${width}% - 6px);`,
      label: formatTime(a.preview.start, view.timeZone),
    };
  });

  // All-day band: one stacked cell per resource column.
  const allDayCount = $derived(
    view.columns.reduce((max, c) => Math.max(max, c.allDay.length), 0),
  );

  // ---- Now indicator -------------------------------------------------------
  const nowTop = $derived.by(() => {
    if (!view.isToday) return null;
    if (now < view.range.start || now >= view.range.end) return null;
    const frac = (now - view.range.start) / (view.range.end - view.range.start);
    return frac * gridHeight;
  });

  // ---- Auto-scroll to ~7am on mount ----------------------------------------
  $effect(() => {
    void view.hourHeight;
    if (scrollEl) scrollEl.scrollTop = Math.max(0, 7 * view.hourHeight - 16);
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

<div class="cal-timegrid cal-resources" style={`--cal-scrollbar:${scrollbarW}px`}>
  <!-- Header: resource names aligned with columns -->
  <div class="cal-timegrid__header">
    <div class="cal-timegrid__gutter-head" aria-hidden="true"></div>
    <div class="cal-timegrid__heads">
      {#each view.columns as col (col.resource.id)}
        <div class="cal-dayhead cal-resource-head">
          {#if col.resource.color}
            <span
              class="cal-resource-head__dot"
              style={`background:${col.resource.color}`}
              aria-hidden="true"
            ></span>
          {/if}
          <span class="cal-resource-head__name">{col.resource.title}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- All-day band: one stacked column per resource -->
  {#if allDayCount > 0}
    <div class="cal-allday">
      <div class="cal-allday__label">All-day</div>
      <div
        class="cal-allday__lanes cal-resources__allday"
        style={`height:${Math.max(allDayCount, 1) * 26 + 6}px`}
      >
        {#each view.columns as col (col.resource.id)}
          <div class="cal-resources__allday-col" style={`width:${100 / colCount}%`}>
            {#each col.allDay as inst (inst.key)}
              {@const editable = inst.editable !== false}
              <div
                class="cal-band cal-band--allday cal-resources__band"
                class:cal-band--readonly={!editable}
                style={inst.color ? `--cal-event-color:${inst.color};` : ""}
                title={inst.title}
                role="button"
                tabindex="0"
                onclick={(e) => {
                  e.stopPropagation();
                  callbacks.onEventClick?.(inst);
                }}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    callbacks.onEventClick?.(inst);
                  }
                }}
              >
                <span class="cal-band__title">{inst.title}</span>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Scrollable grid -->
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

      <!-- Resource columns -->
      <div class="cal-cols" bind:this={gridEl}>
        <div class="cal-hourlines" aria-hidden="true">
          {#each HOURS as h (h)}
            <div class="cal-hourline" style={`height:${view.hourHeight}px`}></div>
          {/each}
        </div>

        {#each view.columns as col, colIndex (col.resource.id)}
          <div
            class="cal-col"
            class:cal-col--today={view.isToday}
            style={`width:${100 / colCount}%`}
            role="presentation"
            aria-label={col.resource.title}
            onpointerdown={(e) => onColumnPointerDown(e, colIndex)}
          >
            {#each col.timed as t (t.instance.key)}
              {@const editable = t.instance.editable !== false}
              <div
                class="cal-event"
                class:cal-event--readonly={!editable}
                style={eventStyle(t) +
                  (t.instance.color ? `--cal-event-color:${t.instance.color};` : "")}
                title={t.instance.title}
                role="button"
                tabindex="0"
                onpointerdown={(e) =>
                  onEventPointerDown(e, t.instance, "move", colIndex)}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    callbacks.onEventClick?.(t.instance);
                }}
              >
                <div class="cal-event__time">
                  {formatTime(t.instance.start, view.timeZone)}
                </div>
                <div class="cal-event__title">{t.instance.title}</div>
                {#if editable}
                  <div
                    class="cal-event__handle cal-event__handle--top"
                    role="presentation"
                    onpointerdown={(e) =>
                      onEventPointerDown(e, t.instance, "resize-start", colIndex)}
                  ></div>
                  <div
                    class="cal-event__handle cal-event__handle--bottom"
                    role="presentation"
                    onpointerdown={(e) =>
                      onEventPointerDown(e, t.instance, "resize-end", colIndex)}
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

        <!-- Now indicator: spans all columns -->
        {#if nowTop !== null}
          <div
            class="cal-now"
            style={`top:${nowTop}px;left:0;width:100%`}
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
