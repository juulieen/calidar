/**
 * Infinite, virtualised agenda view.
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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const instances = instancesInWindow(events, { start: rangeStart, end: rangeEnd }, tz);

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
    sections.push({ dayStart, date, instances: insts, monthBreak: monthKey !== lastMonth });
    lastMonth = monthKey;
  }
  return sections;
}

export function InfiniteAgendaView(): JSX.Element {
  const { snapshot, onEventClick } = useCalendarContext();
  const { events } = snapshot;
  const tz = snapshot.state.timeZone;
  const cursor = snapshot.state.cursor;

  const scrollerRef = useRef<HTMLDivElement>(null);

  // Dynamic day range (epoch day starts). Initialised around the cursor.
  const initial = useMemo(() => {
    const cursorDay = dayStartOf(cursor, tz);
    const start = startOfDayEpoch(addDays(epochToPlainDate(cursorDay, tz), -BACK_DAYS), tz);
    const end = startOfDayEpoch(addDays(epochToPlainDate(cursorDay, tz), FWD_DAYS + 1), tz);
    return { start, end };
    // Only seed once; recentring is handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [range, setRange] = useState(initial);

  // Sections derived from the current range + events + zone.
  const sections = useMemo(
    () => buildSections(events, range.start, range.end, tz),
    [events, range.start, range.end, tz],
  );

  // Measured geometry per dayStart, kept across renders so off-screen spacers
  // can reserve the right height. Pruned to the live sections each render.
  const measuredRef = useRef<Map<number, Measured>>(new Map());
  // Scroll position drives the virtualisation window; bumped on scroll/resize
  // and whenever a measure pass changes geometry.
  const [scrollTick, setScrollTick] = useState(0);

  // ---- Recentre when the cursor / zone changes (toolbar nav, Today) --------
  const lastCursorDay = useRef(dayStartOf(cursor, tz));
  const lastTz = useRef(tz);
  const pendingScrollToDay = useRef<number | null>(dayStartOf(cursor, tz));
  useEffect(() => {
    const cursorDay = dayStartOf(cursor, tz);
    if (cursorDay === lastCursorDay.current && tz === lastTz.current) return;
    lastCursorDay.current = cursorDay;
    lastTz.current = tz;
    measuredRef.current.clear();
    const start = startOfDayEpoch(addDays(epochToPlainDate(cursorDay, tz), -BACK_DAYS), tz);
    const end = startOfDayEpoch(addDays(epochToPlainDate(cursorDay, tz), FWD_DAYS + 1), tz);
    pendingScrollToDay.current = cursorDay;
    setRange({ start, end });
  }, [cursor, tz]);

  // ---- Extend the range (append / prepend) ---------------------------------
  // Guards prevent the sentinel (still satisfied while the new block lays out)
  // from re-firing and stacking range extensions before the previous one has
  // been applied. Released once the new sections are committed (see effect).
  const extendingForward = useRef(false);
  const extendForward = useCallback(() => {
    if (extendingForward.current) return;
    extendingForward.current = true;
    setRange((r) => {
      if (r.end - r.start >= MAX_RANGE_DAYS * 86_400_000) {
        extendingForward.current = false;
        return r;
      }
      const end = startOfDayEpoch(addDays(epochToPlainDate(r.end, tz), CHUNK_DAYS), tz);
      return { start: r.start, end };
    });
  }, [tz]);

  // Prepend must preserve scroll position: remember the anchor section + its
  // offset, restore after the new block is laid out.
  const prependAnchor = useRef<{ dayStart: number; offsetWithinScroller: number } | null>(null);
  // Guards against re-triggering a prepend before the range change has been
  // applied *and* the scroll compensation has run. Without this, the sentinel
  // (still satisfied while the new block lays out) fires repeatedly and a
  // second `extendBackward` overwrites `prependAnchor` before compensation,
  // making the viewport jump.
  const extendingBackward = useRef(false);
  const extendBackward = useCallback(() => {
    // Don't stack prepends: one must finish (range applied + scroll restored)
    // before another can start.
    if (extendingBackward.current || prependAnchor.current) return;
    const scroller = scrollerRef.current;
    if (scroller) {
      // Anchor on the first currently-rendered section we can find.
      const firstSection = scroller.querySelector<HTMLElement>("[data-day-start]");
      if (firstSection) {
        const dayStart = Number(firstSection.dataset.dayStart);
        const offset = firstSection.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        prependAnchor.current = { dayStart, offsetWithinScroller: offset };
      }
    }
    extendingBackward.current = true;
    setRange((r) => {
      if (r.end - r.start >= MAX_RANGE_DAYS * 86_400_000) {
        // Range capped: nothing will change, so release the guard and drop the
        // anchor (no compensation needed).
        extendingBackward.current = false;
        prependAnchor.current = null;
        return r;
      }
      const start = startOfDayEpoch(addDays(epochToPlainDate(r.start, tz), -CHUNK_DAYS), tz);
      return { start, end: r.end };
    });
  }, [tz]);

  // ---- Measure sections after each layout ----------------------------------
  // We read live (non-spacer) section nodes and store their offset/height.
  const sectionRefs = useRef<Map<number, HTMLElement>>(new Map());

  // Stable per-section ref callbacks. Recreating the callback inline on every
  // render makes React detach (call with null) and re-attach (call with node)
  // the ref on each render; caching by dayStart keeps the callback identity
  // stable so the ref only fires on real mount/unmount.
  const registerRefCache = useRef<Map<number, (el: HTMLElement | null) => void>>(new Map());
  const getRegisterRef = useCallback((dayStart: number) => {
    const cache = registerRefCache.current;
    let cb = cache.get(dayStart);
    if (!cb) {
      cb = (el: HTMLElement | null): void => {
        if (el) sectionRefs.current.set(dayStart, el);
        else sectionRefs.current.delete(dayStart);
      };
      cache.set(dayStart, cb);
    }
    return cb;
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const content = scroller.firstElementChild as HTMLElement | null;
    if (!content) return;
    const contentTop = content.getBoundingClientRect().top;
    let changed = false;
    for (const [dayStart, el] of sectionRefs.current) {
      const rect = el.getBoundingClientRect();
      const top = rect.top - contentTop;
      const prev = measuredRef.current.get(dayStart);
      if (!prev || Math.abs(prev.top - top) > 0.5 || Math.abs(prev.height - rect.height) > 0.5) {
        measuredRef.current.set(dayStart, { top, height: rect.height });
        changed = true;
      }
    }
    // Prune measurements (and cached ref callbacks) for days no longer in range.
    const live = new Set(sections.map((s) => s.dayStart));
    for (const k of [...measuredRef.current.keys()]) {
      if (!live.has(k)) measuredRef.current.delete(k);
    }
    for (const k of [...registerRefCache.current.keys()]) {
      if (!live.has(k)) registerRefCache.current.delete(k);
    }
    if (changed) setScrollTick((t) => t + 1);
  }, [sections]);

  // ---- Restore scroll after a prepend / recentre ---------------------------
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    // Prepend compensation: keep the anchored section visually still. Clearing
    // the anchor and releasing the backward guard here (after the new block is
    // laid out and scrollTop corrected) is what lets the next prepend start.
    const anchor = prependAnchor.current;
    if (anchor) {
      prependAnchor.current = null;
      const el = scroller.querySelector<HTMLElement>(
        `[data-day-start="${anchor.dayStart}"]`,
      );
      if (el) {
        const cur = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTop += cur - anchor.offsetWithinScroller;
      }
      extendingBackward.current = false;
    }

    // Recentre: scroll the cursor day (or the nearest following section) into
    // view once it has been laid out.
    const target = pendingScrollToDay.current;
    if (target != null) {
      const measured = measuredRef.current;
      // Find the first section at/after the target day.
      let bestTop: number | null = null;
      for (const s of sections) {
        if (s.dayStart >= target) {
          const m = measured.get(s.dayStart);
          if (m) bestTop = m.top;
          break;
        }
      }
      if (bestTop == null) {
        // Fall back to the last measured section before the target.
        for (let i = sections.length - 1; i >= 0; i--) {
          if (sections[i]!.dayStart <= target) {
            const m = measured.get(sections[i]!.dayStart);
            if (m) bestTop = m.top;
            break;
          }
        }
      }
      if (bestTop != null) {
        pendingScrollToDay.current = null;
        scroller.scrollTop = Math.max(0, bestTop);
      }
    }
  }, [sections]);

  // ---- Scroll / resize bookkeeping + sentinel detection --------------------
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let raf = 0;
    const onScroll = (): void => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setScrollTick((t) => t + 1);
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
    const ro = new ResizeObserver(() => setScrollTick((t) => t + 1));
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [extendForward, extendBackward]);

  // Once the new sections are committed, release the forward-extension guard so
  // a later scroll can append again. (The measure layout effect above already
  // refreshes spacer heights and bumps `scrollTick`, so no extra tick is needed
  // here.) The backward guard is released by the prepend-compensation effect.
  useEffect(() => {
    extendingForward.current = false;
  }, [sections]);

  // ---- Decide which sections render live vs. as a spacer -------------------
  // A section renders live when it overlaps the viewport ± buffer, or when we
  // have no measurement for it yet (so it can be measured on first paint).
  const scroller = scrollerRef.current;
  const viewTop = scroller ? scroller.scrollTop : 0;
  const viewBottom = scroller ? scroller.scrollTop + scroller.clientHeight : Number.POSITIVE_INFINITY;
  const windowTop = viewTop - VIRTUAL_BUFFER_PX;
  const windowBottom = viewBottom + VIRTUAL_BUFFER_PX;

  // Reference the tick so the window recomputes on scroll / remeasure.
  void scrollTick;

  return (
    <div
      ref={scrollerRef}
      className="cal-agenda cal-agenda--infinite"
      role="list"
      aria-label="Agenda"
      tabIndex={0}
    >
      <div className="cal-agenda__content">
        {sections.length === 0 ? (
          <div className="cal-agenda--empty">No events in this range.</div>
        ) : (
          sections.map((section) => {
            const m = measuredRef.current.get(section.dayStart);
            const live =
              !m || (m.top + m.height >= windowTop && m.top <= windowBottom);
            if (!live && m) {
              return (
                <div
                  key={section.dayStart}
                  className="cal-agenda__spacer"
                  data-day-start={section.dayStart}
                  style={{ height: m.height }}
                  aria-hidden="true"
                />
              );
            }
            return (
              <AgendaSection
                key={section.dayStart}
                section={section}
                timeZone={tz}
                onClick={onEventClick}
                registerRef={getRegisterRef(section.dayStart)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function AgendaSection({
  section,
  timeZone,
  onClick,
  registerRef,
}: {
  section: DaySection;
  timeZone: string;
  onClick?: (instance: EventInstance) => void;
  registerRef: (el: HTMLElement | null) => void;
}): JSX.Element {
  const today = isSameDay(section.date, epochToPlainDate(Date.now(), timeZone));
  return (
    <div ref={registerRef} data-day-start={section.dayStart}>
      {section.monthBreak && (
        <div className="cal-agenda__month" aria-hidden="true">
          {formatMonthYear(section.date)}
        </div>
      )}
      <section
        className={`cal-agenda__section${today ? " cal-agenda__section--today" : ""}`}
        aria-label={formatAgendaDay(section.date)}
        role="listitem"
      >
        <h3 className="cal-agenda__date">{formatAgendaDay(section.date)}</h3>
        <ul className="cal-agenda__list">
          {section.instances.map((inst) => (
            <AgendaRow key={inst.key} instance={inst} timeZone={timeZone} onClick={onClick} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function AgendaRow({
  instance,
  timeZone,
  onClick,
}: {
  instance: EventInstance;
  timeZone: string;
  onClick?: (instance: EventInstance) => void;
}): JSX.Element {
  return (
    <li>
      <button type="button" className="cal-agenda__row" onClick={() => onClick?.(instance)}>
        <span
          className="cal-agenda__chip"
          style={{ ["--cal-event-color" as string]: instance.color || undefined }}
          aria-hidden="true"
        />
        <span className="cal-agenda__time">
          {instance.allDay
            ? "All day"
            : `${formatTime(instance.start, timeZone)} – ${formatTime(instance.end, timeZone)}`}
        </span>
        <span className="cal-agenda__title">{instance.title}</span>
      </button>
    </li>
  );
}
