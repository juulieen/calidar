/**
 * Infinite, virtualised agenda view (Solid port).
 *
 * Unlike the static {@link AgendaView} (which renders a precomputed
 * `AgendaViewModel` for a fixed window), this view owns a *dynamic* day range
 * around the cursor and materialises day sections on demand through the core
 * `instancesInWindow` selector. Two things keep it cheap on large datasets:
 *
 *  1. **Bidirectional infinite scroll.** Sentinels near the top and bottom of
 *     the scroller extend the day range by a fixed chunk (append at the bottom,
 *     prepend at the top). On prepend we compensate `scrollTop` by the height of
 *     the inserted block so the viewport does not jump.
 *
 *  2. **Windowed (virtualised) DOM.** Every day section is measured; sections
 *     outside the viewport (plus a buffer) are replaced by a single spacer of
 *     their measured height, so the number of *mounted* sections stays bounded
 *     no matter how far the user scrolls while `scrollHeight` keeps growing.
 *
 * The toolbar's ‹ › / Today actions move `store.cursor`; this view watches the
 * cursor (and the time zone / events) and recentres — resetting the range and
 * scrolling to the cursor day.
 */
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
import type { CalendarEvent, EventInstance, PlainDate } from "@calidar/core";
import {
  addDays,
  epochToPlainDate,
  instancesInWindow,
  isSameDay,
  startOfDayEpoch,
} from "@calidar/core";
import { useCalendarContext } from "./context.js";
import { formatAgendaDay, formatTime, formatMonthYear } from "./format.js";

/** Days materialised before the cursor on (re)centre. */
const BACK_DAYS = 7;
/** Days materialised after the cursor on (re)centre. */
const FWD_DAYS = 30;
/** Day chunk appended/prepended when a sentinel is reached. */
const CHUNK_DAYS = 21;
/** Hard cap on the materialised range to keep instance expansion bounded. */
const MAX_RANGE_DAYS = 2000;
/** Extra pixels above/below the viewport kept mounted while virtualising. */
const VIRTUAL_BUFFER_PX = 800;
/**
 * Distance (px) from the top/bottom edge at which a sentinel fires to extend
 * the range. A *fixed* threshold (rather than one tied to `clientHeight`) is
 * important: when the view starts near the top, `scrollTop < clientHeight`
 * stays permanently true and prepends fire on every scroll frame.
 */
const SENTINEL_PX = 300;

/** One materialised day that carries at least one instance. */
interface DaySection {
  /** Stable key: the day's start-of-day epoch. */
  dayStart: number;
  date: PlainDate;
  instances: EventInstance[];
  /** True when this is the first rendered day of its month (draws a divider). */
  monthBreak: boolean;
}

/** Per-section geometry, measured after layout (offsets relative to content). */
interface Measured {
  top: number;
  height: number;
}

/** Day-start epoch of an instant in the given zone. */
function dayStartOf(epoch: number, tz: string): number {
  return startOfDayEpoch(epochToPlainDate(epoch, tz), tz);
}

/**
 * Materialise the day sections for `[rangeStart, rangeEnd)` (epoch day starts).
 * Groups instances by their start day; only days with ≥1 instance become
 * sections, mirroring the static agenda. Marks the first section of each month.
 */
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

  // Bucket by day-start epoch (in the display zone).
  const byDay = new Map<number, EventInstance[]>();
  for (const inst of instances) {
    // Clamp the bucket day to the window so an instance starting before the
    // range (a long multi-day event) still lands on the first visible day.
    const rawDay = dayStartOf(inst.start, tz);
    const day = rawDay < rangeStart ? rangeStart : rawDay;
    const bucket = byDay.get(day);
    if (bucket) bucket.push(inst);
    else byDay.set(day, [inst]);
  }

  const days = [...byDay.keys()].sort((a, b) => a - b);
  let lastMonth = -1;
  const sections: DaySection[] = [];
  for (const dayStart of days) {
    const date = epochToPlainDate(dayStart, tz);
    const insts = byDay.get(dayStart)!;
    insts.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1; // all-day first
      return a.start - b.start || a.end - b.end;
    });
    const monthKey = date.year * 12 + date.month;
    sections.push({
      dayStart,
      date,
      instances: insts,
      monthBreak: monthKey !== lastMonth,
    });
    lastMonth = monthKey;
  }
  return sections;
}

export function InfiniteAgendaView(): JSX.Element {
  const { snapshot, callbacks } = useCalendarContext();
  const events = (): CalendarEvent[] => snapshot().events;
  const tz = (): string => snapshot().state.timeZone;
  const cursor = (): number => snapshot().state.cursor;

  let scrollerRef: HTMLDivElement | undefined;

  // Dynamic day range (epoch day starts). Initialised around the cursor.
  const seedRange = (): { start: number; end: number } => {
    const cursorDay = dayStartOf(cursor(), tz());
    const start = startOfDayEpoch(
      addDays(epochToPlainDate(cursorDay, tz()), -BACK_DAYS),
      tz(),
    );
    const end = startOfDayEpoch(
      addDays(epochToPlainDate(cursorDay, tz()), FWD_DAYS + 1),
      tz(),
    );
    return { start, end };
  };

  const [range, setRange] = createSignal(seedRange());

  // Sections derived from the current range + events + zone.
  const sections = createMemo<DaySection[]>(() =>
    buildSections(events(), range().start, range().end, tz()),
  );

  // Measured geometry per dayStart, kept across renders so off-screen spacers
  // can reserve the right height. Pruned to the live sections each render.
  // Backed by a reactive version counter so the windowing memo recomputes when
  // a measure pass changes geometry.
  const measured = new Map<number, Measured>();
  const [measuredVersion, setMeasuredVersion] = createSignal(0);
  // Current scroll offset of the scroller, updated (rAF-throttled) on every
  // scroll/resize. This is the signal the live/spacer decision reads so the
  // virtualisation window slides as the user scrolls.
  const [scrollTop, setScrollTop] = createSignal(0);
  const [clientHeight, setClientHeight] = createSignal(0);

  // ---- Recentre when the cursor / zone changes (toolbar nav, Today) --------
  let lastCursorDay = dayStartOf(cursor(), tz());
  let lastTz = tz();
  let pendingScrollToDay: number | null = dayStartOf(cursor(), tz());
  createEffect(() => {
    const cursorDay = dayStartOf(cursor(), tz());
    const curTz = tz();
    if (cursorDay === lastCursorDay && curTz === lastTz) return;
    lastCursorDay = cursorDay;
    lastTz = curTz;
    measured.clear();
    const start = startOfDayEpoch(
      addDays(epochToPlainDate(cursorDay, curTz), -BACK_DAYS),
      curTz,
    );
    const end = startOfDayEpoch(
      addDays(epochToPlainDate(cursorDay, curTz), FWD_DAYS + 1),
      curTz,
    );
    pendingScrollToDay = cursorDay;
    setRange({ start, end });
  });

  // ---- Extend the range (append / prepend) ---------------------------------
  // Guards prevent the sentinel (still satisfied while the new block lays out)
  // from re-firing and stacking range extensions before the previous one has
  // been applied. Released once the new sections are committed (see effect).
  let extendingForward = false;
  const extendForward = (): void => {
    if (extendingForward) return;
    extendingForward = true;
    setRange((r) => {
      if (r.end - r.start >= MAX_RANGE_DAYS * 86_400_000) {
        extendingForward = false;
        return r;
      }
      const end = startOfDayEpoch(
        addDays(epochToPlainDate(r.end, tz()), CHUNK_DAYS),
        tz(),
      );
      return { start: r.start, end };
    });
  };

  // Prepend must preserve scroll position: remember the anchor section + its
  // offset, restore after the new block is laid out.
  let prependAnchor: { dayStart: number; offsetWithinScroller: number } | null =
    null;
  // Guards against re-triggering a prepend before the range change has been
  // applied *and* the scroll compensation has run.
  let extendingBackward = false;
  const extendBackward = (): void => {
    // Don't stack prepends: one must finish (range applied + scroll restored)
    // before another can start.
    if (extendingBackward || prependAnchor) return;
    const scroller = scrollerRef;
    if (scroller) {
      // Anchor on the first currently-rendered section we can find.
      const firstSection =
        scroller.querySelector<HTMLElement>("[data-day-start]");
      if (firstSection) {
        const dayStart = Number(firstSection.dataset.dayStart);
        const offset =
          firstSection.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top;
        prependAnchor = { dayStart, offsetWithinScroller: offset };
      }
    }
    extendingBackward = true;
    setRange((r) => {
      if (r.end - r.start >= MAX_RANGE_DAYS * 86_400_000) {
        // Range capped: nothing will change, so release the guard and drop the
        // anchor (no compensation needed).
        extendingBackward = false;
        prependAnchor = null;
        return r;
      }
      const start = startOfDayEpoch(
        addDays(epochToPlainDate(r.start, tz()), -CHUNK_DAYS),
        tz(),
      );
      return { start, end: r.end };
    });
  };

  // ---- Per-section ref registry (live = non-spacer section nodes) ----------
  const sectionRefs = new Map<number, HTMLElement>();
  const registerRef = (dayStart: number, el: HTMLElement | null): void => {
    if (el) sectionRefs.set(dayStart, el);
    else sectionRefs.delete(dayStart);
  };

  // ---- Measure sections + restore scroll, after each render of `sections` ---
  // The DOM read/compensation MUST run after layout. A bare `createEffect`
  // fires before child `onMount`s have registered their refs (and before the
  // browser lays the new nodes out), so `sectionRefs` would be empty and no
  // section would ever get measured — leaving every section "unmeasured" and
  // therefore permanently live (the virtualization-leak bug). We instead track
  // `sections()` reactively and defer the actual measurement to a rAF, by which
  // point refs are registered and geometry is final.
  const measurePass = (snapshot: DaySection[]): void => {
    const scroller = scrollerRef;
    if (!scroller) return;
    const content = scroller.firstElementChild as HTMLElement | null;
    if (!content) return;

    // -- Measure live sections.
    const contentTop = content.getBoundingClientRect().top;
    let changed = false;
    for (const [dayStart, el] of sectionRefs) {
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
    const liveKeys = new Set(snapshot.map((s) => s.dayStart));
    for (const k of [...measured.keys()]) {
      if (!liveKeys.has(k)) measured.delete(k);
    }

    // -- Prepend compensation: keep the anchored section visually still.
    const anchor = prependAnchor;
    if (anchor) {
      prependAnchor = null;
      const el = scroller.querySelector<HTMLElement>(
        `[data-day-start="${anchor.dayStart}"]`,
      );
      if (el) {
        const cur =
          el.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top;
        scroller.scrollTop += cur - anchor.offsetWithinScroller;
      }
      extendingBackward = false;
    }

    // -- Recentre: scroll the cursor day (or nearest following section) in.
    const target = pendingScrollToDay;
    if (target != null) {
      let bestTop: number | null = null;
      for (const s of snapshot) {
        if (s.dayStart >= target) {
          const m = measured.get(s.dayStart);
          if (m) bestTop = m.top;
          break;
        }
      }
      if (bestTop == null) {
        for (let i = snapshot.length - 1; i >= 0; i--) {
          if (snapshot[i]!.dayStart <= target) {
            const m = measured.get(snapshot[i]!.dayStart);
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

    // Release the forward-extension guard now that the new sections committed.
    extendingForward = false;

    // Programmatic scrollTop changes above (prepend compensation / recentre)
    // don't reliably emit a scroll event in time, so refresh the metric signals
    // here to keep the windowing memo in sync.
    setScrollTop(scroller.scrollTop);
    setClientHeight(scroller.clientHeight);

    if (changed) setMeasuredVersion((v) => v + 1);
  };

  let measureRaf = 0;
  createEffect(() => {
    const snapshot = sections();
    // Subscribe to scroll too: when distant sections recycle into spacers and
    // closer ones mount in, their geometry must be (re)measured.
    scrollTop();
    if (measureRaf) cancelAnimationFrame(measureRaf);
    measureRaf = requestAnimationFrame(() => {
      measureRaf = 0;
      measurePass(snapshot);
    });
  });
  onCleanup(() => {
    if (measureRaf) cancelAnimationFrame(measureRaf);
  });

  // ---- Scroll / resize bookkeeping + sentinel detection --------------------
  // Publish the current scroll offset / viewport height into signals so the
  // windowing memo recomputes (and recycles distant sections into spacers) as
  // the user scrolls. rAF-throttled to one update per frame.
  const syncMetrics = (): void => {
    const scroller = scrollerRef;
    if (!scroller) return;
    setScrollTop(scroller.scrollTop);
    setClientHeight(scroller.clientHeight);
  };
  onMount(() => {
    const scroller = scrollerRef;
    if (!scroller) return;
    syncMetrics();
    let raf = 0;
    const onScroll = (): void => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        syncMetrics();
        const { scrollTop, scrollHeight, clientHeight } = scroller;
        // Near bottom → append; near top → prepend. Fixed-pixel sentinels so a
        // view that rests near the top doesn't prepend on every frame.
        if (scrollHeight - (scrollTop + clientHeight) < SENTINEL_PX) {
          extendForward();
        }
        if (scrollTop < SENTINEL_PX) {
          extendBackward();
        }
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => syncMetrics());
    ro.observe(scroller);
    onCleanup(() => {
      scroller.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    });
  });

  // ---- Decide which sections render live vs. as a spacer -------------------
  // A section renders live when it overlaps the viewport ± buffer, or when we
  // have no measurement for it yet (so it can be measured on first paint). The
  // window slides as the user scrolls because it reads the reactive `scrollTop`
  // / `clientHeight` signals (rAF-updated on every scroll).
  const windowBounds = createMemo<{ top: number; bottom: number }>(() => {
    const top = scrollTop();
    const height = clientHeight();
    return {
      top: top - VIRTUAL_BUFFER_PX,
      bottom: top + height + VIRTUAL_BUFFER_PX,
    };
  });

  return (
    <div
      ref={scrollerRef}
      class="cal-agenda cal-agenda--infinite"
      role="list"
      aria-label="Agenda"
      tabindex={0}
    >
      <div class="cal-agenda__content">
        <Show
          when={sections().length > 0}
          fallback={
            <div class="cal-agenda--empty">No events in this range.</div>
          }
        >
          <For each={sections()}>
            {(section) => {
              // Reactive per-section geometry: tracks `measuredVersion` so it
              // refreshes after a measure pass writes into the plain Map.
              const m = createMemo<Measured | undefined>(() => {
                measuredVersion();
                return measured.get(section.dayStart);
              });
              // Live iff unmeasured (render once so it can be measured) or its
              // measured band overlaps the viewport ± buffer. This memo tracks
              // `windowBounds()` (scroll) + `m()` (measure), so distant sections
              // flip to spacers as the user scrolls and recycle the DOM.
              const live = createMemo<boolean>(() => {
                const measure = m();
                if (!measure) return true;
                const w = windowBounds();
                return (
                  measure.top + measure.height >= w.top &&
                  measure.top <= w.bottom
                );
              });
              return (
                <Show
                  when={live()}
                  fallback={
                    <div
                      class="cal-agenda__spacer"
                      data-day-start={section.dayStart}
                      style={{ height: `${m()?.height ?? 0}px` }}
                      aria-hidden="true"
                    />
                  }
                >
                  <AgendaSection
                    section={section}
                    timeZone={tz()}
                    onClick={callbacks.onEventClick}
                    registerRef={(el) => registerRef(section.dayStart, el)}
                  />
                </Show>
              );
            }}
          </For>
        </Show>
      </div>
    </div>
  );
}

function AgendaSection(props: {
  section: DaySection;
  timeZone: string;
  onClick?: (instance: EventInstance) => void;
  registerRef: (el: HTMLElement | null) => void;
}): JSX.Element {
  const today = (): boolean =>
    isSameDay(props.section.date, epochToPlainDate(Date.now(), props.timeZone));
  let el: HTMLDivElement | undefined;
  onMount(() => props.registerRef(el ?? null));
  onCleanup(() => props.registerRef(null));
  return (
    <div ref={el} data-day-start={props.section.dayStart}>
      <Show when={props.section.monthBreak}>
        <div class="cal-agenda__month" aria-hidden="true">
          {formatMonthYear(props.section.date)}
        </div>
      </Show>
      <section
        class="cal-agenda__section"
        classList={{ "cal-agenda__section--today": today() }}
        aria-label={formatAgendaDay(props.section.date)}
        role="listitem"
      >
        <h3 class="cal-agenda__date">{formatAgendaDay(props.section.date)}</h3>
        <ul class="cal-agenda__list">
          <For each={props.section.instances}>
            {(inst) => (
              <AgendaRow
                instance={inst}
                timeZone={props.timeZone}
                onClick={props.onClick}
              />
            )}
          </For>
        </ul>
      </section>
    </div>
  );
}

function AgendaRow(props: {
  instance: EventInstance;
  timeZone: string;
  onClick?: (instance: EventInstance) => void;
}): JSX.Element {
  return (
    <li>
      <button
        type="button"
        class="cal-agenda__row"
        onClick={() => props.onClick?.(props.instance)}
      >
        <span
          class="cal-agenda__chip"
          style={{ "--cal-event-color": props.instance.color || undefined }}
          aria-hidden="true"
        />
        <span class="cal-agenda__time">
          {props.instance.allDay
            ? "All day"
            : `${formatTime(props.instance.start, props.timeZone)} – ${formatTime(props.instance.end, props.timeZone)}`}
        </span>
        <span class="cal-agenda__title">{props.instance.title}</span>
      </button>
    </li>
  );
}
