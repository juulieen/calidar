<script lang="ts">
  /**
   * Infinite, virtualised agenda view.
   *
   * Unlike the static {@link AgendaView} (which renders a precomputed
   * `AgendaViewModel` for a fixed window), this view owns a *dynamic* day range
   * around the cursor and materialises day sections on demand through the core
   * `instancesInWindow` selector. Two things keep it cheap on large datasets:
   *
   *  1. **Bidirectional infinite scroll.** Fixed-pixel sentinels near the top
   *     and bottom of the scroller extend the day range by a chunk (append at
   *     the bottom, prepend at the top). On prepend we compensate `scrollTop` by
   *     the height of the inserted block so the viewport does not jump.
   *
   *  2. **Windowed (virtualised) DOM.** Every day section is measured; sections
   *     outside the viewport (plus a buffer) are replaced by a single spacer of
   *     their measured height, so the number of *mounted* sections stays bounded
   *     while `scrollHeight` keeps growing.
   *
   * The toolbar's ‹ › / Today actions move `store.cursor`; this view watches the
   * cursor (and the time zone / events) and recentres — resetting the range and
   * scrolling to the cursor day.
   */
  import type {
    CalendarEvent,
    CalendarSnapshot,
    EventInstance,
    PlainDate,
  } from "@calidar/core";
  import {
    addDays,
    epochToPlainDate,
    instancesInWindow,
    isSameDay,
    startOfDayEpoch,
  } from "@calidar/core";
  import type { CalendarCallbacks } from "./types.js";
  import { createFormatters, formatMonthYear, type Formatters } from "./format.js";

  interface Props {
    snapshot: CalendarSnapshot;
    callbacks: CalendarCallbacks;
    formatters?: Formatters;
  }
  const { snapshot, callbacks, formatters = createFormatters() }: Props = $props();
  const { formatAgendaDay, formatTime } = $derived(formatters);

  /** Days materialised before the cursor on (re)centre. */
  const BACK_DAYS = 7;
  /** Days materialised after the cursor on (re)centre. */
  const FWD_DAYS = 30;
  /** Day chunk appended / prepended when a sentinel is reached. */
  const CHUNK_DAYS = 21;
  /** Hard cap on the materialised range to keep instance expansion bounded. */
  const MAX_RANGE_DAYS = 2000;
  /** Extra pixels above/below the viewport kept mounted while virtualising. */
  const VIRTUAL_BUFFER_PX = 800;
  /** Distance (px) from an edge at which a sentinel fires to extend the range. */
  const SENTINEL_PX = 300;
  const DAY_MS = 86_400_000;

  interface DaySection {
    dayStart: number;
    date: PlainDate;
    instances: EventInstance[];
    monthBreak: boolean;
  }

  interface Measured {
    top: number;
    height: number;
  }

  function dayStartOf(epoch: number, tz: string): number {
    return startOfDayEpoch(epochToPlainDate(epoch, tz), tz);
  }

  function buildSections(
    events: CalendarEvent[],
    rangeStart: number,
    rangeEnd: number,
    tz: string,
  ): DaySection[] {
    const instances = instancesInWindow(
      events,
      { start: rangeStart, end: rangeEnd },
      tz,
    );

    const byDay = new Map<number, EventInstance[]>();
    for (const inst of instances) {
      const rawDay = dayStartOf(inst.start, tz);
      const day = rawDay < rangeStart ? rangeStart : rawDay;
      const bucket = byDay.get(day);
      if (bucket) bucket.push(inst);
      else byDay.set(day, [inst]);
    }

    const days = [...byDay.keys()].sort((a, b) => a - b);
    let lastMonth = -1;
    const out: DaySection[] = [];
    for (const dayStart of days) {
      const date = epochToPlainDate(dayStart, tz);
      const insts = byDay.get(dayStart)!;
      insts.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.start - b.start || a.end - b.end;
      });
      const monthKey = date.year * 12 + date.month;
      out.push({ dayStart, date, instances: insts, monthBreak: monthKey !== lastMonth });
      lastMonth = monthKey;
    }
    return out;
  }

  const tz = $derived(snapshot.state.timeZone);
  const cursor = $derived(snapshot.state.cursor);
  const events = $derived(snapshot.events);

  let scrollerEl: HTMLDivElement | undefined = $state();

  // Dynamic day range (epoch day starts). Seeded once around the initial cursor;
  // recentring is handled by the effect below.
  // svelte-ignore state_referenced_locally
  const seed = (() => {
    const cursorDay = dayStartOf(snapshot.state.cursor, snapshot.state.timeZone);
    const start = startOfDayEpoch(
      addDays(epochToPlainDate(cursorDay, snapshot.state.timeZone), -BACK_DAYS),
      snapshot.state.timeZone,
    );
    const end = startOfDayEpoch(
      addDays(epochToPlainDate(cursorDay, snapshot.state.timeZone), FWD_DAYS + 1),
      snapshot.state.timeZone,
    );
    return { start, end };
  })();

  let rangeStart = $state(seed.start);
  let rangeEnd = $state(seed.end);

  const sections = $derived(buildSections(events, rangeStart, rangeEnd, tz));

  // Measured geometry per dayStart, kept across renders so off-screen spacers
  // can reserve the right height. Pruned to the live sections each measure pass.
  const measured = new Map<number, Measured>();
  // Bumped on scroll/resize and whenever a measure pass changes geometry, so the
  // virtualisation window recomputes.
  let scrollTick = $state(0);

  // Live (non-spacer) section nodes, registered via an action.
  const sectionNodes = new Map<number, HTMLElement>();

  // ---- Recentre when the cursor / zone changes -----------------------------
  // svelte-ignore state_referenced_locally
  let lastCursorDay = dayStartOf(snapshot.state.cursor, snapshot.state.timeZone);
  // svelte-ignore state_referenced_locally
  let lastTz = snapshot.state.timeZone;
  // svelte-ignore state_referenced_locally
  let pendingScrollToDay: number | null = lastCursorDay;

  $effect(() => {
    const cursorDay = dayStartOf(cursor, tz);
    if (cursorDay === lastCursorDay && tz === lastTz) return;
    lastCursorDay = cursorDay;
    lastTz = tz;
    measured.clear();
    const start = startOfDayEpoch(addDays(epochToPlainDate(cursorDay, tz), -BACK_DAYS), tz);
    const end = startOfDayEpoch(addDays(epochToPlainDate(cursorDay, tz), FWD_DAYS + 1), tz);
    pendingScrollToDay = cursorDay;
    rangeStart = start;
    rangeEnd = end;
  });

  // ---- Extend the range (append / prepend) ---------------------------------
  let extendingForward = false;
  function extendForward(): void {
    if (extendingForward) return;
    extendingForward = true;
    if (rangeEnd - rangeStart >= MAX_RANGE_DAYS * DAY_MS) {
      extendingForward = false;
      return;
    }
    rangeEnd = startOfDayEpoch(addDays(epochToPlainDate(rangeEnd, tz), CHUNK_DAYS), tz);
  }

  let prependAnchor: { dayStart: number; offset: number } | null = null;
  let extendingBackward = false;
  function extendBackward(): void {
    if (extendingBackward || prependAnchor) return;
    const scroller = scrollerEl;
    if (scroller) {
      const firstSection = scroller.querySelector<HTMLElement>("[data-day-start]");
      if (firstSection) {
        const dayStart = Number(firstSection.dataset.dayStart);
        const offset =
          firstSection.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top;
        prependAnchor = { dayStart, offset };
      }
    }
    extendingBackward = true;
    if (rangeEnd - rangeStart >= MAX_RANGE_DAYS * DAY_MS) {
      extendingBackward = false;
      prependAnchor = null;
      return;
    }
    rangeStart = startOfDayEpoch(addDays(epochToPlainDate(rangeStart, tz), -CHUNK_DAYS), tz);
  }

  // ---- Measure sections after each layout, then virtualise -----------------
  // This effect depends on `sections` (re-runs on range/events/tz change) and
  // also performs the post-layout scroll compensation / recentre.
  $effect(() => {
    // Track sections so this re-runs on any change.
    const live = sections;
    const scroller = scrollerEl;
    if (!scroller) return;
    const content = scroller.firstElementChild as HTMLElement | null;
    if (!content) return;

    const contentTop = content.getBoundingClientRect().top;
    let changed = false;
    for (const [dayStart, el] of sectionNodes) {
      const rect = el.getBoundingClientRect();
      const top = rect.top - contentTop;
      const prev = measured.get(dayStart);
      if (
        !prev ||
        Math.abs(prev.top - top) > 0.5 ||
        Math.abs(prev.height - rect.height) > 0.5
      ) {
        measured.set(dayStart, { top, height: rect.height });
        changed = true;
      }
    }
    // Prune measurements for days no longer in range.
    const liveKeys = new Set(live.map((s) => s.dayStart));
    for (const k of [...measured.keys()]) if (!liveKeys.has(k)) measured.delete(k);

    // Prepend compensation: keep the anchored section visually still.
    const anchor = prependAnchor;
    if (anchor) {
      prependAnchor = null;
      const el = scroller.querySelector<HTMLElement>(
        `[data-day-start="${anchor.dayStart}"]`,
      );
      if (el) {
        const cur =
          el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTop += cur - anchor.offset;
      }
      extendingBackward = false;
    }

    // Recentre: scroll the cursor day (or nearest following section) into view.
    const target = pendingScrollToDay;
    if (target != null) {
      let bestTop: number | null = null;
      for (const s of live) {
        if (s.dayStart >= target) {
          const m = measured.get(s.dayStart);
          if (m) bestTop = m.top;
          break;
        }
      }
      if (bestTop == null) {
        for (let i = live.length - 1; i >= 0; i--) {
          if (live[i]!.dayStart <= target) {
            const m = measured.get(live[i]!.dayStart);
            if (m) bestTop = m.top;
            break;
          }
        }
      }
      if (bestTop != null) {
        pendingScrollToDay = null;
        scroller.scrollTop = Math.max(0, bestTop);
      }
    }

    // Release the forward-extension guard once new sections are committed.
    extendingForward = false;

    if (changed) scrollTick += 1;
  });

  // ---- Scroll / resize bookkeeping + sentinel detection --------------------
  $effect(() => {
    const scroller = scrollerEl;
    if (!scroller) return;
    let raf = 0;
    const onScroll = (): void => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        scrollTick += 1;
        const { scrollTop, scrollHeight, clientHeight } = scroller;
        if (scrollHeight - (scrollTop + clientHeight) < SENTINEL_PX) extendForward();
        if (scrollTop < SENTINEL_PX) extendBackward();
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => (scrollTick += 1));
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  });

  // ---- Virtualisation window -----------------------------------------------
  const windowBounds = $derived.by(() => {
    void scrollTick; // recompute on scroll / remeasure
    const scroller = scrollerEl;
    const viewTop = scroller ? scroller.scrollTop : 0;
    const viewBottom = scroller
      ? scroller.scrollTop + scroller.clientHeight
      : Number.POSITIVE_INFINITY;
    return {
      top: viewTop - VIRTUAL_BUFFER_PX,
      bottom: viewBottom + VIRTUAL_BUFFER_PX,
    };
  });

  function isLive(dayStart: number): boolean {
    const m = measured.get(dayStart);
    if (!m) return true; // unmeasured → render so it can be measured
    return m.top + m.height >= windowBounds.top && m.top <= windowBounds.bottom;
  }

  function spacerHeight(dayStart: number): number {
    return measured.get(dayStart)?.height ?? 0;
  }

  // Action: register a live section node by its dayStart for measuring.
  function registerSection(el: HTMLElement, dayStart: number) {
    sectionNodes.set(dayStart, el);
    return {
      destroy() {
        sectionNodes.delete(dayStart);
      },
    };
  }

  function isToday(date: PlainDate): boolean {
    return isSameDay(date, epochToPlainDate(Date.now(), tz));
  }

  function timeLabel(inst: EventInstance): string {
    if (inst.allDay) return "All day";
    return `${formatTime(inst.start, tz)} – ${formatTime(inst.end, tz)}`;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={scrollerEl}
  class="cal-agenda cal-agenda--infinite"
  role="list"
  aria-label="Agenda"
  tabindex="0"
>
  <div class="cal-agenda__content">
    {#if sections.length === 0}
      <div class="cal-agenda__empty">No events in this range.</div>
    {:else}
      {#each sections as section (section.dayStart)}
        {#if isLive(section.dayStart)}
          <div use:registerSection={section.dayStart} data-day-start={section.dayStart}>
            {#if section.monthBreak}
              <div class="cal-agenda__month" aria-hidden="true">
                {formatMonthYear(section.date)}
              </div>
            {/if}
            <section
              class="cal-agenda__section"
              class:cal-agenda__section--today={isToday(section.date)}
              aria-label={formatAgendaDay(section.date)}
              role="listitem"
            >
              <h3 class="cal-agenda__date">{formatAgendaDay(section.date)}</h3>
              <ul class="cal-agenda__list">
                {#each section.instances as inst (inst.key)}
                  <li>
                    <button
                      type="button"
                      class="cal-agenda__item"
                      onclick={() => callbacks.onEventClick?.(inst)}
                    >
                      <span
                        class="cal-agenda__dot"
                        style={inst.color ? `--cal-event-color:${inst.color}` : ""}
                        aria-hidden="true"
                      ></span>
                      <span class="cal-agenda__time">{timeLabel(inst)}</span>
                      <span class="cal-agenda__title">{inst.title}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </section>
          </div>
        {:else}
          <div
            class="cal-agenda__spacer"
            data-day-start={section.dayStart}
            style={`height:${spacerHeight(section.dayStart)}px`}
            aria-hidden="true"
          ></div>
        {/if}
      {/each}
    {/if}
  </div>
</div>
