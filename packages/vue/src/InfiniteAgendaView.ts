/**
 * Infinite, virtualised agenda view (Vue port).
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
  computed,
  defineComponent,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type ComponentPublicInstance,
  type VNode,
} from "vue";
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

export const InfiniteAgendaView = defineComponent({
  name: "InfiniteAgendaView",
  setup() {
    const { snapshot, onEventClick } = useCalendarContext();

    const scrollerRef = ref<HTMLDivElement | null>(null);

    const tz = (): string => snapshot.value.state.timeZone;
    const cursor = (): number => snapshot.value.state.cursor;

    // Dynamic day range (epoch day starts). Initialised around the cursor.
    const seedRange = (): { start: number; end: number } => {
      const z = tz();
      const cursorDay = dayStartOf(cursor(), z);
      const start = startOfDayEpoch(
        addDays(epochToPlainDate(cursorDay, z), -BACK_DAYS),
        z,
      );
      const end = startOfDayEpoch(
        addDays(epochToPlainDate(cursorDay, z), FWD_DAYS + 1),
        z,
      );
      return { start, end };
    };

    const range = ref(seedRange());

    // Sections derived from the current range + events + zone.
    const sections = computed<DaySection[]>(() =>
      buildSections(snapshot.value.events, range.value.start, range.value.end, tz()),
    );

    // Measured geometry per dayStart, kept across renders so off-screen spacers
    // can reserve the right height. Pruned to the live sections each render.
    const measured = new Map<number, Measured>();
    // Scroll position drives the virtualisation window; bumped on scroll/resize
    // and whenever a measure pass changes geometry.
    const scrollTick = ref(0);

    // Live section DOM nodes registered by ref callbacks.
    const sectionEls = new Map<number, HTMLElement>();

    // ---- Recentre when the cursor / zone changes (toolbar nav, Today) -------
    let lastCursorDay = dayStartOf(cursor(), tz());
    let lastTz = tz();
    let pendingScrollToDay: number | null = dayStartOf(cursor(), tz());

    // ---- Extend guards -------------------------------------------------------
    let extendingForward = false;
    let extendingBackward = false;
    let prependAnchor: {
      dayStart: number;
      offsetWithinScroller: number;
    } | null = null;

    const extendForward = (): void => {
      if (extendingForward) return;
      extendingForward = true;
      const r = range.value;
      if (r.end - r.start >= MAX_RANGE_DAYS * 86_400_000) {
        extendingForward = false;
        return;
      }
      const end = startOfDayEpoch(
        addDays(epochToPlainDate(r.end, tz()), CHUNK_DAYS),
        tz(),
      );
      range.value = { start: r.start, end };
    };

    const extendBackward = (): void => {
      // Don't stack prepends: one must finish (range applied + scroll restored)
      // before another can start.
      if (extendingBackward || prependAnchor) return;
      const scroller = scrollerRef.value;
      if (scroller) {
        // Anchor on the first currently-rendered section we can find.
        const firstSection = scroller.querySelector<HTMLElement>(
          "[data-day-start]",
        );
        if (firstSection) {
          const dayStart = Number(firstSection.dataset.dayStart);
          const offset =
            firstSection.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top;
          prependAnchor = { dayStart, offsetWithinScroller: offset };
        }
      }
      extendingBackward = true;
      const r = range.value;
      if (r.end - r.start >= MAX_RANGE_DAYS * 86_400_000) {
        // Range capped: nothing will change, so release the guard and drop the
        // anchor (no compensation needed).
        extendingBackward = false;
        prependAnchor = null;
        return;
      }
      const start = startOfDayEpoch(
        addDays(epochToPlainDate(r.start, tz()), -CHUNK_DAYS),
        tz(),
      );
      range.value = { start, end: r.end };
    };

    // Stable per-section ref callbacks (cached by dayStart so the ref only fires
    // on real mount/unmount, not on every render).
    type RefCb = (el: Element | ComponentPublicInstance | null) => void;
    const refCache = new Map<number, RefCb>();
    const getRegisterRef = (dayStart: number): RefCb => {
      let cb = refCache.get(dayStart);
      if (!cb) {
        cb = (el: Element | ComponentPublicInstance | null): void => {
          if (el) sectionEls.set(dayStart, el as HTMLElement);
          else sectionEls.delete(dayStart);
        };
        refCache.set(dayStart, cb);
      }
      return cb;
    };

    // ---- Measure + scroll restore, after each layout (flush: 'post') --------
    const afterLayout = (): void => {
      const scroller = scrollerRef.value;
      if (!scroller) return;
      const content = scroller.firstElementChild as HTMLElement | null;
      if (!content) return;
      const contentTop = content.getBoundingClientRect().top;
      let changed = false;
      for (const [dayStart, el] of sectionEls) {
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
      // Prune measurements (and cached ref callbacks) for days out of range.
      const live = new Set(sections.value.map((s) => s.dayStart));
      for (const k of [...measured.keys()]) {
        if (!live.has(k)) measured.delete(k);
      }
      for (const k of [...refCache.keys()]) {
        if (!live.has(k)) refCache.delete(k);
      }

      // Prepend compensation: keep the anchored section visually still.
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

      // Recentre: scroll the cursor day (or the nearest following section) into
      // view once it has been laid out.
      const target = pendingScrollToDay;
      if (target != null) {
        let bestTop: number | null = null;
        for (const s of sections.value) {
          if (s.dayStart >= target) {
            const m = measured.get(s.dayStart);
            if (m) bestTop = m.top;
            break;
          }
        }
        if (bestTop == null) {
          for (let i = sections.value.length - 1; i >= 0; i--) {
            if (sections.value[i]!.dayStart <= target) {
              const m = measured.get(sections.value[i]!.dayStart);
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

      // Release the forward-extension guard so a later scroll can append again.
      extendingForward = false;

      if (changed) scrollTick.value++;
    };

    // Run measurement whenever the section list changes, after the DOM updates.
    watch(
      sections,
      () => {
        void nextTick(afterLayout);
      },
      { flush: "post" },
    );

    // Recentre watcher (cursor / zone changes).
    watch(
      () => [snapshot.value.state.cursor, snapshot.value.state.timeZone] as const,
      () => {
        const z = tz();
        const cursorDay = dayStartOf(cursor(), z);
        if (cursorDay === lastCursorDay && z === lastTz) return;
        lastCursorDay = cursorDay;
        lastTz = z;
        measured.clear();
        const start = startOfDayEpoch(
          addDays(epochToPlainDate(cursorDay, z), -BACK_DAYS),
          z,
        );
        const end = startOfDayEpoch(
          addDays(epochToPlainDate(cursorDay, z), FWD_DAYS + 1),
          z,
        );
        pendingScrollToDay = cursorDay;
        range.value = { start, end };
      },
    );

    // ---- Scroll / resize bookkeeping + sentinel detection -------------------
    let raf = 0;
    let ro: ResizeObserver | null = null;
    const onScroll = (): void => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        scrollTick.value++;
        const scroller = scrollerRef.value;
        if (!scroller) return;
        const { scrollTop, scrollHeight, clientHeight } = scroller;
        if (scrollHeight - (scrollTop + clientHeight) < SENTINEL_PX) {
          extendForward();
        }
        if (scrollTop < SENTINEL_PX) {
          extendBackward();
        }
      });
    };

    onMounted(() => {
      const scroller = scrollerRef.value;
      if (!scroller) return;
      scroller.addEventListener("scroll", onScroll, { passive: true });
      ro = new ResizeObserver(() => {
        scrollTick.value++;
      });
      ro.observe(scroller);
      // Initial measure / centre once the first layout is committed.
      void nextTick(afterLayout);
    });

    onUnmounted(() => {
      const scroller = scrollerRef.value;
      scroller?.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
    });

    return () => {
      const scroller = scrollerRef.value;
      const viewTop = scroller ? scroller.scrollTop : 0;
      const viewBottom = scroller
        ? scroller.scrollTop + scroller.clientHeight
        : Number.POSITIVE_INFINITY;
      const windowTop = viewTop - VIRTUAL_BUFFER_PX;
      const windowBottom = viewBottom + VIRTUAL_BUFFER_PX;

      // Reference the tick so the window recomputes on scroll / remeasure.
      void scrollTick.value;

      const list = sections.value;
      const z = tz();

      const contentChildren: VNode[] =
        list.length === 0
          ? [
              h(
                "div",
                { class: "cal-agenda--empty" },
                "No events in this range.",
              ),
            ]
          : list.map((section) => {
              const m = measured.get(section.dayStart);
              const live =
                !m ||
                (m.top + m.height >= windowTop && m.top <= windowBottom);
              if (!live && m) {
                return h("div", {
                  key: section.dayStart,
                  class: "cal-agenda__spacer",
                  "data-day-start": section.dayStart,
                  style: { height: `${m.height}px` },
                  "aria-hidden": "true",
                });
              }
              return renderSection(
                section,
                z,
                onEventClick,
                getRegisterRef(section.dayStart),
              );
            });

      return h(
        "div",
        {
          ref: scrollerRef,
          class: "cal-agenda cal-agenda--infinite",
          role: "list",
          "aria-label": "Agenda",
          tabindex: 0,
        },
        [h("div", { class: "cal-agenda__content" }, contentChildren)],
      );
    };
  },
});

function renderSection(
  section: DaySection,
  timeZone: string,
  onClick: ((instance: EventInstance) => void) | undefined,
  registerRef: (el: Element | ComponentPublicInstance | null) => void,
): VNode {
  const today = isSameDay(
    section.date,
    epochToPlainDate(Date.now(), timeZone),
  );
  return h(
    "div",
    { key: section.dayStart, ref: registerRef, "data-day-start": section.dayStart },
    [
      section.monthBreak
        ? h(
            "div",
            { class: "cal-agenda__month", "aria-hidden": "true" },
            formatMonthYear(section.date),
          )
        : null,
      h(
        "section",
        {
          class: `cal-agenda__section${
            today ? " cal-agenda__section--today" : ""
          }`,
          "aria-label": formatAgendaDay(section.date),
          role: "listitem",
        },
        [
          h(
            "h3",
            { class: "cal-agenda__date" },
            formatAgendaDay(section.date),
          ),
          h(
            "ul",
            { class: "cal-agenda__list" },
            section.instances.map((inst) =>
              renderRow(inst, timeZone, onClick),
            ),
          ),
        ],
      ),
    ],
  );
}

function renderRow(
  instance: EventInstance,
  timeZone: string,
  onClick: ((instance: EventInstance) => void) | undefined,
): VNode {
  return h("li", { key: instance.key }, [
    h(
      "button",
      {
        type: "button",
        class: "cal-agenda__row",
        onClick: () => onClick?.(instance),
      },
      [
        h("span", {
          class: "cal-agenda__chip",
          style: { "--cal-event-color": instance.color || undefined },
          "aria-hidden": "true",
        }),
        h(
          "span",
          { class: "cal-agenda__time" },
          instance.allDay
            ? "All day"
            : `${formatTime(instance.start, timeZone)} – ${formatTime(instance.end, timeZone)}`,
        ),
        h("span", { class: "cal-agenda__title" }, instance.title),
      ],
    ),
  ]);
}
