<script lang="ts">
  /**
   * Timeline view: resources as rows, a HORIZONTAL time axis.
   *
   * A frozen left column lists the resources (colour pip + name), or a single
   * "All events" row when no resources are configured. To its right a
   * horizontally scrollable lane holds a time axis (graduations from the model's
   * `slots`), vertical gridlines, and — per resource row — the event bars
   * positioned from the fractional `left`/`width` geometry the core selector
   * produced. Overlapping bars stack by `lane`; a "now" marker tracks the
   * current instant.
   *
   * Timeline is an adapter-LOCAL mode: it renders `computeTimelineView(...)`
   * without ever mutating `store.view`, exactly like the Resources view.
   *
   * Interactions (pointer): drag a bar horizontally to move it in time, drag the
   * left/right edge to resize, and drag vertically onto another resource row to
   * reassign `resourceId`. Pixel→time mapping snaps to 15-minute steps. Locked
   * (`editable === false`) bars are inert. Recurring instances defer to the
   * scope popover via the shared commit logic.
   */
  import type {
    CalendarStore,
    EventInstance,
    TimelineBar,
    TimelineRowModel,
    TimelineViewModel,
  } from "@calidar/core";
  import type { CalendarCallbacks, RecurringEditScope } from "./types.js";
  import {
    routeCommit,
    applyRecurringEdit,
    type EditBounds,
    type ExtraPatch,
  } from "./recurringEdit.js";
  import RecurringScopeDialog from "./RecurringScopeDialog.svelte";
  import { createFormatters, timelineTickLabel, type Formatters } from "./format.js";

  /** Height of one stacked bar lane, in px. */
  const LANE_HEIGHT = 30;
  /** Vertical padding reserved inside a row (top + bottom), in px. */
  const ROW_PAD = 10;
  /** Minimum row height — keeps single-lane rows at a ≥44px touch target. */
  const MIN_ROW_HEIGHT = 44;
  /** Snap granularity for the time axis, in ms (15 minutes). */
  const SNAP_MS = 15 * 60_000;
  /** Pointer travel (px) before a press becomes a drag rather than a click. */
  const DRAG_THRESHOLD = 4;

  interface Props {
    store: CalendarStore;
    view: TimelineViewModel;
    now: number;
    callbacks: CalendarCallbacks;
    formatters?: Formatters;
  }
  const { store, view, now, callbacks, formatters = createFormatters() }: Props =
    $props();
  const { formatTime } = $derived(formatters);

  const rows = $derived(view.rows);
  const slots = $derived(view.slots);
  const range = $derived(view.range);
  const unit = $derived(view.unit);
  const span = $derived(range.end - range.start);

  type DragKind = "move" | "resize-start" | "resize-end";

  interface ActiveDrag {
    kind: DragKind;
    instance: EventInstance;
    fromRow: number;
    toRow: number;
    start: number;
    end: number;
    moved: boolean;
  }

  function rowHeight(row: TimelineRowModel): number {
    return Math.max(
      Math.max(row.lanes, 1) * LANE_HEIGHT + ROW_PAD,
      MIN_ROW_HEIGHT,
    );
  }

  function snap(epoch: number): number {
    return Math.round(epoch / SNAP_MS) * SNAP_MS;
  }

  let axisEl: HTMLDivElement | undefined = $state();
  let rowsEl: HTMLDivElement | undefined = $state();

  let active = $state<ActiveDrag | null>(null);
  let activeRef: ActiveDrag | null = null;

  // Map a clientX onto an epoch instant across the (possibly scrolled) axis.
  function instantAt(clientX: number): number {
    if (!axisEl) return range.start;
    const rect = axisEl.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    const clamped = Math.min(Math.max(frac, 0), 1);
    return range.start + clamped * span;
  }

  // Map a clientY onto a row index (for cross-row resource reassignment).
  function rowAt(clientY: number): number {
    const el = rowsEl;
    if (!el) return 0;
    const children = Array.from(el.children).filter(
      (c) => (c as HTMLElement).getAttribute("role") === "row",
    ) as HTMLElement[];
    for (let i = 0; i < children.length; i++) {
      const r = children[i]!.getBoundingClientRect();
      if (clientY >= r.top && clientY < r.bottom) return i;
    }
    return clientY < el.getBoundingClientRect().top ? 0 : rows.length - 1;
  }

  // ---- Recurring scope flow ------------------------------------------------
  interface PendingRecurring {
    instance: EventInstance;
    occurrenceStart: number;
    patch: EditBounds;
    extra: ExtraPatch;
  }
  let pending = $state<PendingRecurring | null>(null);

  function commit(
    instance: EventInstance,
    patch: EditBounds,
    extra: ExtraPatch,
  ): void {
    const req = routeCommit(
      store,
      callbacks,
      instance,
      instance.start,
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

  function beginDrag(
    e: PointerEvent,
    instance: EventInstance,
    rowIndex: number,
    kind: DragKind,
  ): void {
    if (instance.editable === false) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = instance.start;
    const origEnd = instance.end;
    const grabInstant = instantAt(startX);

    activeRef = {
      kind,
      instance,
      fromRow: rowIndex,
      toRow: rowIndex,
      start: origStart,
      end: origEnd,
      moved: false,
    };
    active = activeRef;

    const onMove = (ev: PointerEvent): void => {
      const prev = activeRef;
      if (!prev) return;
      const moved =
        prev.moved ||
        Math.abs(ev.clientX - startX) > DRAG_THRESHOLD ||
        (kind === "move" && Math.abs(ev.clientY - startY) > DRAG_THRESHOLD);
      const pointer = instantAt(ev.clientX);
      let nextStart = prev.start;
      let nextEnd = prev.end;
      let toRow = prev.toRow;

      if (kind === "move") {
        nextStart = snap(origStart + (pointer - grabInstant));
        nextEnd = nextStart + (origEnd - origStart);
        toRow = rowAt(ev.clientY);
      } else if (kind === "resize-start") {
        nextStart = Math.min(snap(pointer), origEnd - SNAP_MS);
        nextEnd = origEnd;
      } else {
        nextStart = origStart;
        nextEnd = Math.max(snap(pointer), origStart + SNAP_MS);
      }

      activeRef = { ...prev, start: nextStart, end: nextEnd, toRow, moved };
      active = activeRef;
    };

    const cleanup = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };

    const onUp = (): void => {
      cleanup();
      const final = activeRef;
      active = null;
      activeRef = null;
      if (!final || !final.moved) return;

      let extra: ExtraPatch = {};
      if (kind === "move" && final.toRow !== final.fromRow) {
        const target = rows[final.toRow]?.resource;
        if (target) extra = { resourceId: target.id };
      }
      commit(instance, { start: final.start, end: final.end }, extra);
    };

    const onCancel = (): void => {
      cleanup();
      active = null;
      activeRef = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  /** Fractional width of slot `i` (distance to the next slot, or to the end). */
  function slotWidth(i: number): number {
    const here = slots[i]!.left;
    const next = slots[i + 1]?.left ?? 1;
    return Math.max(next - here, 0);
  }

  function barStyle(bar: TimelineBar): string {
    return `left:${bar.left * 100}%;width:${bar.width * 100}%;top:${bar.lane * LANE_HEIGHT + ROW_PAD / 2}px;`;
  }

  // ---- Auto-scroll the day axis toward ~7am on mount -----------------------
  let didScroll = $state(false);
  $effect(() => {
    if (didScroll || unit !== "day") return;
    // axisEl = .cal-timeline__lanes → parent .cal-timeline__track → parent
    // .cal-timeline__scroll (the scrollable element).
    const el = axisEl?.parentElement?.parentElement;
    if (!el) return;
    didScroll = true;
    el.scrollLeft = Math.max(0, el.scrollWidth * (7 / 24) - 24);
  });

  // ---- Live "now" marker, ticking each minute ------------------------------
  // Seed from the initial `now` prop; the interval drives it forward thereafter.
  // svelte-ignore state_referenced_locally
  let tick = $state(now);
  $effect(() => {
    const id = setInterval(() => (tick = Date.now()), 60_000);
    return () => clearInterval(id);
  });
  const current = $derived(Math.max(now, tick));
  const nowFrac = $derived(
    current >= range.start && current < range.end
      ? (current - range.start) / span
      : null,
  );

  // Preview geometry for the live drag.
  const preview = $derived.by(() => {
    const a = active;
    if (!a || !a.moved) return null;
    const left = Math.max((a.start - range.start) / span, 0);
    const width = Math.max((a.end - a.start) / span, 0);
    let top = ROW_PAD / 2;
    const targetRow = a.kind === "move" ? a.toRow : a.fromRow;
    for (let i = 0; i < targetRow; i++) top += rowHeight(rows[i]!);
    return {
      style: `left:${left * 100}%;width:${width * 100}%;top:${top}px;` +
        (a.instance.color ? `--cal-event-color:${a.instance.color};` : ""),
      label: formatTime(a.start, view.timeZone),
    };
  });
</script>

<div class="cal-timeline">
  <div class="cal-timeline__grid">
    <!-- Frozen resource column -->
    <div class="cal-timeline__resources" role="rowgroup">
      <div class="cal-timeline__corner" aria-hidden="true"></div>
      {#each rows as row (row.resource?.id ?? "all")}
        <div
          class="cal-timeline__res"
          style={`height:${rowHeight(row)}px`}
          role="rowheader"
        >
          {#if row.resource}
            <span
              class="cal-timeline__pip"
              style={`background:${row.resource.color || "var(--cal-accent)"}`}
              aria-hidden="true"
            ></span>
            <span class="cal-timeline__res-name">{row.resource.title}</span>
          {:else}
            <span class="cal-timeline__res-name">All events</span>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Scrollable axis + bars -->
    <div class="cal-timeline__scroll">
      <div class="cal-timeline__track">
        <!-- Time axis header -->
        <div class="cal-timeline__axis">
          {#each slots as slot, i (slot.start)}
            <div
              class="cal-timeline__tick"
              class:cal-timeline__tick--now={slot.isNow}
              style={`left:${slot.left * 100}%;width:${slotWidth(i) * 100}%`}
            >
              <span class="cal-timeline__tick-label">
                {timelineTickLabel(slot.start, unit, view.timeZone)}
              </span>
            </div>
          {/each}
        </div>

        <!-- Rows with vertical gridlines + bars -->
        <div class="cal-timeline__lanes" bind:this={axisEl}>
          <div class="cal-timeline__lines" aria-hidden="true">
            {#each slots as slot (slot.start)}
              <div class="cal-timeline__vline" style={`left:${slot.left * 100}%`}></div>
            {/each}
          </div>

          {#if nowFrac !== null}
            <div
              class="cal-timeline__now"
              style={`left:${nowFrac * 100}%`}
              aria-hidden="true"
            >
              <span class="cal-timeline__now-dot"></span>
            </div>
          {/if}

          <div class="cal-timeline__rows" bind:this={rowsEl}>
            {#each rows as row, rowIndex (row.resource?.id ?? "all")}
              <div
                class="cal-timeline__row"
                class:cal-timeline__row--drop={active &&
                  active.kind === "move" &&
                  active.toRow === rowIndex &&
                  active.fromRow !== rowIndex}
                style={`height:${rowHeight(row)}px`}
                role="row"
              >
                {#each row.bars as bar (bar.instance.key)}
                  {@const editable = bar.instance.editable !== false}
                  {@const hidden =
                    active?.instance.key === bar.instance.key && active.moved}
                  <div
                    class="cal-event cal-timeline__bar"
                    class:cal-event--readonly={!editable}
                    style={barStyle(bar) +
                      (hidden ? "visibility:hidden;" : "") +
                      (bar.instance.color
                        ? `--cal-event-color:${bar.instance.color};`
                        : "")}
                    title={bar.instance.title}
                    role="button"
                    tabindex="0"
                    onpointerdown={(e) => {
                      if (!editable) return;
                      beginDrag(e, bar.instance, rowIndex, "move");
                    }}
                    onclick={(e) => {
                      e.stopPropagation();
                      callbacks.onEventClick?.(bar.instance);
                    }}
                    onkeydown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        callbacks.onEventClick?.(bar.instance);
                      }
                    }}
                  >
                    {#if editable && !bar.continuesBefore}
                      <span
                        class="cal-timeline__handle cal-timeline__handle--start"
                        role="presentation"
                        onpointerdown={(e) =>
                          beginDrag(e, bar.instance, rowIndex, "resize-start")}
                      ></span>
                    {/if}
                    <span class="cal-event__title">
                      {bar.continuesBefore ? "‹ " : ""}{bar.instance.title}{bar.continuesAfter
                        ? " ›"
                        : ""}
                    </span>
                    {#if editable && !bar.continuesAfter}
                      <span
                        class="cal-timeline__handle cal-timeline__handle--end"
                        role="presentation"
                        onpointerdown={(e) =>
                          beginDrag(e, bar.instance, rowIndex, "resize-end")}
                      ></span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/each}

            <!-- Live drag preview -->
            {#if preview}
              <div
                class="cal-event cal-event--ghost cal-timeline__bar"
                style={preview.style}
              >
                <span class="cal-event__time">{preview.label}</span>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>

  {#if pending}
    <RecurringScopeDialog onChoose={onScopeChoose} onCancel={onScopeCancel} />
  {/if}
</div>
