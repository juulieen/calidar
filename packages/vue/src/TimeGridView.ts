/**
 * Time-grid view (Vue port) for the day / days / week kinds.
 *
 * Layout: an hour gutter on the left, a sticky all-day band on top, then a
 * scrollable grid of day columns. Timed events are absolutely positioned from
 * the fractional geometry the core layout produced; multi-day & all-day events
 * render as banded rows. A "now" line tracks the current instant.
 */
import {
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  ref,
  type PropType,
  type VNode,
} from "vue";
import type {
  DayBand,
  DragMode,
  EventInstance,
  TimedLayout,
  TimeGridViewModel,
} from "@calidar/core";
import { epochToWall } from "@calidar/core";
import { useCalendarContext } from "./context.js";
import { useGridDrag, type ActiveDrag } from "./useGridDrag.js";
import { useDayDrag, type ActiveDayDrag } from "./useDayDrag.js";
import { useCommitEdit } from "./useCommitEdit.js";
import { RecurrenceScopePopover } from "./RecurrenceScopePopover.js";
import type { Formatters } from "./format.js";

type FormatTime = Formatters["formatTime"];
type FormatWeekdayShort = Formatters["formatWeekdayShort"];

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const COLUMN_GAP_PCT = 4; // horizontal breathing room between overlap columns

type DayModel = TimeGridViewModel["days"][number];

export const TimeGridView = defineComponent({
  name: "TimeGridView",
  props: {
    model: { type: Object as PropType<TimeGridViewModel>, required: true },
  },
  setup(props) {
    const { snapshot, onEventCreate, onEventClick, onSelectSlot, formatters } =
      useCalendarContext();

    const edit = useCommitEdit();

    const scrollRef = ref<HTMLDivElement | null>(null);
    const columnsRef = ref<HTMLDivElement | null>(null);
    const allDayLanesRef = ref<HTMLDivElement | null>(null);

    // Measure the scrollbar gutter so the header / all-day rows can reserve the
    // exact same width and stay aligned with the scrollable day columns.
    const scrollbarW = ref(0);
    let ro: ResizeObserver | null = null;
    const didScroll = ref(false);
    // Re-tick the "now" line each minute so it drifts down realistically.
    const nowTick = ref(snapshot.value.now);
    let nowTimer: ReturnType<typeof setInterval> | null = null;

    onMounted(() => {
      const el = scrollRef.value;
      if (el) {
        const measure = (): void => {
          const w = el.offsetWidth - el.clientWidth;
          if (scrollbarW.value !== w) scrollbarW.value = w;
        };
        measure();
        ro = new ResizeObserver(measure);
        ro.observe(el);

        // Auto-scroll to ~7am on first mount / view change.
        if (!didScroll.value) {
          didScroll.value = true;
          el.scrollTop = Math.max(0, 7 * props.model.hourHeight - 16);
        }
      }
      nowTimer = setInterval(() => {
        nowTick.value = Date.now();
      }, 60_000);
    });

    onUnmounted(() => {
      ro?.disconnect();
      if (nowTimer) clearInterval(nowTimer);
    });

    const metrics = () => ({
      hourHeight: props.model.hourHeight,
      dayStarts: props.model.days.map((d) => d.dayStart),
    });

    const gridTop = (): number =>
      columnsRef.value?.getBoundingClientRect().top ?? 0;

    const columnAt = (clientX: number): number => {
      const el = columnsRef.value;
      const days = props.model.days;
      if (!el || days.length === 0) return 0;
      const rect = el.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      return Math.floor(frac * days.length);
    };

    const onCommit = (d: ActiveDrag): void => {
      const { preview, instance } = d;
      if (instance === null) {
        onEventCreate?.({ start: preview.start, end: preview.end, allDay: false });
        return;
      }
      edit.commit(instance, { start: preview.start, end: preview.end });
    };

    const onClick = (
      eventId: string | null,
      _dayIndex: number,
      instant: number,
    ): void => {
      if (eventId === null) {
        onSelectSlot?.({ start: instant, end: instant + 30 * 60_000 });
      }
    };

    const drag = useGridDrag({ metrics, gridTop, columnAt, onCommit, onClick });

    // ---- All-day band: whole-day drag/create/resize ---------------------
    const allDayCells = () =>
      props.model.days.map((d) => ({ dayStart: d.dayStart, dayEnd: d.dayEnd }));

    const allDayColumnAt = (clientX: number): number => {
      const el = allDayLanesRef.value;
      const days = props.model.days;
      if (!el || days.length === 0) return 0;
      const rect = el.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      return Math.floor(frac * days.length);
    };

    const onAllDayCommit = (c: {
      start: number;
      end: number;
      instance: EventInstance | null;
    }): void => {
      if (c.instance === null) {
        onEventCreate?.({ start: c.start, end: c.end, allDay: true });
        return;
      }
      edit.commit(c.instance, { start: c.start, end: c.end });
    };

    const onAllDayClick = (instance: EventInstance | null): void => {
      if (instance) onEventClick?.(instance);
    };

    const allDayDrag = useDayDrag({
      cells: allDayCells,
      columnAt: (clientX) => allDayColumnAt(clientX),
      onCommit: onAllDayCommit,
      onClick: onAllDayClick,
    });

    return () => {
      const { formatHour, formatTime, formatWeekdayShort } = formatters.value;
      const model = props.model;
      const { hourHeight, timeZone, days, allDayBands, allDayLaneCount } = model;
      const gridHeight = 24 * hourHeight;

      const children: VNode[] = [
        // Header row: gutter spacer + weekday labels
        h("div", { class: "cal-timegrid__head", role: "row" }, [
          h("div", {
            class: "cal-timegrid__gutter-spacer",
            "aria-hidden": "true",
          }),
          h(
            "div",
            { class: "cal-timegrid__day-heads" },
            days.map((day) => renderDayHead(day, formatWeekdayShort)),
          ),
        ]),
      ];

      // All-day band
      if (allDayLaneCount > 0) {
        const lanesChildren: (VNode | null)[] = allDayBands.map((band) =>
          renderAllDayBand(band, days.length, allDayDrag, onEventClick),
        );
        if (allDayDrag.active.value) {
          lanesChildren.push(
            renderAllDayPreview(allDayDrag.active.value, days.length),
          );
        }
        children.push(
          h("div", { class: "cal-timegrid__allday", role: "row" }, [
            h(
              "div",
              {
                class: "cal-timegrid__gutter-spacer cal-timegrid__allday-label",
                "aria-hidden": "true",
              },
              "all-day",
            ),
            h(
              "div",
              {
                ref: allDayLanesRef,
                class: "cal-timegrid__allday-lanes",
                style: {
                  height: `${Math.max(allDayLaneCount, 1) * 26 + 6}px`,
                },
                onPointerdown: (e: PointerEvent) => {
                  if (e.button !== 0 && e.pointerType === "mouse") return;
                  allDayDrag.startCreate(e, allDayColumnAt(e.clientX));
                },
              },
              lanesChildren,
            ),
          ]),
        );
      }

      // Scrollable grid
      children.push(
        h(
          "div",
          { class: "cal-timegrid__scroll", ref: scrollRef },
          [
            h(
              "div",
              { class: "cal-timegrid__body", style: { height: `${gridHeight}px` } },
              [
                // Hour gutter
                h(
                  "div",
                  { class: "cal-timegrid__gutter", "aria-hidden": "true" },
                  HOURS.map((hr) =>
                    h(
                      "div",
                      {
                        key: hr,
                        class: "cal-timegrid__hour",
                        style: { height: `${hourHeight}px` },
                      },
                      [
                        h(
                          "span",
                          { class: "cal-timegrid__hour-label" },
                          hr === 0 ? "" : formatHour(hr),
                        ),
                      ],
                    ),
                  ),
                ),
                // Day columns
                h(
                  "div",
                  {
                    class: "cal-timegrid__columns",
                    ref: columnsRef,
                    role: "presentation",
                  },
                  [
                    // Hour gridlines
                    h(
                      "div",
                      { class: "cal-timegrid__lines", "aria-hidden": "true" },
                      HOURS.map((hr) =>
                        h("div", {
                          key: hr,
                          class: "cal-timegrid__line",
                          style: { height: `${hourHeight}px` },
                        }),
                      ),
                    ),
                    ...days.map((day, dayIndex) =>
                      renderColumn(
                        day,
                        dayIndex,
                        days.length,
                        gridHeight,
                        timeZone,
                        drag,
                        onEventClick,
                        formatWeekdayShort,
                        formatTime,
                      ),
                    ),
                    renderNowLine(model, gridHeight, Math.max(snapshot.value.now, nowTick.value)),
                  ],
                ),
              ],
            ),
          ],
        ),
      );

      const pending = edit.pending.value;
      if (pending) {
        children.push(
          h(RecurrenceScopePopover, {
            title: pending.instance.title,
            onChoose: (scope) => edit.resolve(scope),
            onCancel: () => edit.cancel(),
          }),
        );
      }

      return h(
        "div",
        {
          class: "cal-timegrid",
          style: {
            "--cal-hour-height": `${hourHeight}px`,
            "--cal-scrollbar": `${scrollbarW.value}px`,
          },
        },
        children,
      );
    };
  },
});

function renderDayHead(
  day: DayModel,
  formatWeekdayShort: FormatWeekdayShort,
): VNode {
  return h(
    "div",
    {
      key: day.dayStart,
      class: `cal-day-head${day.isToday ? " cal-day-head--today" : ""}`,
      role: "columnheader",
    },
    [
      h("span", { class: "cal-day-head__name" }, formatWeekdayShort(day.date)),
      h("span", { class: "cal-day-head__num" }, String(day.date.day)),
    ],
  );
}

function renderColumn(
  day: DayModel,
  dayIndex: number,
  dayCount: number,
  gridHeight: number,
  timeZone: string,
  drag: ReturnType<typeof useGridDrag>,
  onEventClick: ((instance: EventInstance) => void) | undefined,
  formatWeekdayShort: FormatWeekdayShort,
  formatTime: FormatTime,
): VNode {
  const colChildren: (VNode | null)[] = day.timed.map((layout) =>
    renderTimedEvent(
      layout,
      gridHeight,
      timeZone,
      drag,
      dayIndex,
      onEventClick,
      formatTime,
    ),
  );

  const active = drag.active.value;
  if (active && active.dayIndex === dayIndex) {
    colChildren.push(
      renderPreviewGhost(active, day, gridHeight, timeZone, formatTime),
    );
  }

  return h(
    "div",
    {
      key: day.dayStart,
      class: `cal-col${day.isToday ? " cal-col--today" : ""}${
        day.isWeekend ? " cal-col--weekend" : ""
      }`,
      role: "gridcell",
      "aria-label": `${formatWeekdayShort(day.date)} ${day.date.day}`,
      onPointerdown: (e: PointerEvent) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        drag.startCreate(e, dayIndex);
      },
      style: { width: `${100 / dayCount}%` },
    },
    colChildren,
  );
}

function renderTimedEvent(
  layout: TimedLayout,
  gridHeight: number,
  timeZone: string,
  drag: ReturnType<typeof useGridDrag>,
  dayIndex: number,
  onEventClick: ((instance: EventInstance) => void) | undefined,
  formatTime: FormatTime,
): VNode {
  const { instance } = layout;
  const topPx = layout.top * gridHeight;
  const heightPx = Math.max(layout.height * gridHeight, 16);
  const widthPct = layout.width * 100;
  const leftPct = layout.left * 100;
  const editable = instance.editable !== false;

  const start = (e: PointerEvent, mode: DragMode): void =>
    drag.startEvent(e, instance, mode, dayIndex);

  return h(
    "div",
    {
      class: `cal-event${editable ? "" : " cal-event--locked"}`,
      role: "button",
      tabindex: 0,
      "aria-label": `${instance.title}, ${formatTime(instance.start, timeZone)}`,
      style: {
        top: `${topPx}px`,
        height: `${heightPx}px`,
        left: `calc(${leftPct}% + 1px)`,
        width: `calc(${widthPct}% - ${COLUMN_GAP_PCT}px)`,
        "--cal-event-color": instance.color || undefined,
      },
      onPointerdown: (e: PointerEvent) => start(e, "move"),
      onClick: (e: MouseEvent) => {
        e.stopPropagation();
        onEventClick?.(instance);
      },
      onKeydown: (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEventClick?.(instance);
        }
      },
    },
    [
      editable
        ? h("span", {
            class: "cal-event__handle cal-event__handle--top",
            onPointerdown: (e: PointerEvent) => {
              e.stopPropagation();
              start(e, "resize-start");
            },
          })
        : null,
      h(
        "span",
        { class: "cal-event__time" },
        formatTime(instance.start, timeZone),
      ),
      h("span", { class: "cal-event__title" }, instance.title),
      editable
        ? h("span", {
            class: "cal-event__handle cal-event__handle--bottom",
            onPointerdown: (e: PointerEvent) => {
              e.stopPropagation();
              start(e, "resize-end");
            },
          })
        : null,
    ],
  );
}

function renderPreviewGhost(
  active: ActiveDrag,
  day: DayModel,
  gridHeight: number,
  timeZone: string,
  formatTime: FormatTime,
): VNode {
  const { preview } = active;
  const dayMs = day.dayEnd - day.dayStart;
  const top = ((preview.start - day.dayStart) / dayMs) * gridHeight;
  const height = Math.max(
    ((preview.end - preview.start) / dayMs) * gridHeight,
    16,
  );
  return h(
    "div",
    {
      class: "cal-event cal-event--preview",
      style: { top: `${top}px`, height: `${height}px` },
    },
    [
      h(
        "span",
        { class: "cal-event__time" },
        formatTime(preview.start, timeZone),
      ),
    ],
  );
}

function renderAllDayBand(
  band: DayBand,
  dayCount: number,
  allDayDrag: ReturnType<typeof useDayDrag>,
  onEventClick: ((instance: EventInstance) => void) | undefined,
): VNode {
  const span = band.endCol - band.startCol + 1;
  const editable = band.instance.editable !== false;

  const onStart = (
    e: PointerEvent,
    mode: "move" | "resize-start" | "resize-end",
  ): void =>
    allDayDrag.startEvent(e, band.instance, mode, band.startCol, band.endCol);

  return h(
    "div",
    {
      key: band.instance.key,
      class: `cal-band cal-band--allday${editable ? "" : " cal-band--locked"}`,
      role: "button",
      tabindex: 0,
      style: {
        left: `${(band.startCol / dayCount) * 100}%`,
        width: `${(span / dayCount) * 100}%`,
        top: `${band.lane * 26}px`,
        "--cal-event-color": band.instance.color || undefined,
      },
      onPointerdown: (e: PointerEvent) => {
        if (!editable) return;
        if (e.button !== 0 && e.pointerType === "mouse") return;
        onStart(e, "move");
      },
      onClick: (e: MouseEvent) => {
        e.stopPropagation();
        onEventClick?.(band.instance);
      },
      onKeydown: (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEventClick?.(band.instance);
        }
      },
      title: band.instance.title,
    },
    [
      editable && !band.continuesBefore
        ? h("span", {
            class: "cal-band__handle cal-band__handle--start",
            onPointerdown: (e: PointerEvent) => {
              e.stopPropagation();
              onStart(e, "resize-start");
            },
          })
        : null,
      h("span", { class: "cal-band__title" }, [
        band.continuesBefore ? "‹ " : "",
        band.instance.title,
        band.continuesAfter ? " ›" : "",
      ]),
      editable && !band.continuesAfter
        ? h("span", {
            class: "cal-band__handle cal-band__handle--end",
            onPointerdown: (e: PointerEvent) => {
              e.stopPropagation();
              onStart(e, "resize-end");
            },
          })
        : null,
    ],
  );
}

function renderAllDayPreview(active: ActiveDayDrag, dayCount: number): VNode {
  const span = active.endCol - active.startCol + 1;
  return h("div", {
    class: "cal-band cal-band--allday cal-band--preview",
    style: {
      left: `${(active.startCol / dayCount) * 100}%`,
      width: `${(span / dayCount) * 100}%`,
      top: `0px`,
    },
  });
}

function renderNowLine(
  model: TimeGridViewModel,
  gridHeight: number,
  current: number,
): VNode | null {
  const todayIdx = model.days.findIndex((d) => d.isToday);
  if (todayIdx === -1) return null;
  const day = model.days[todayIdx]!;
  if (current < day.dayStart || current >= day.dayEnd) return null;

  const wall = epochToWall(current, model.timeZone);
  const minutes = wall.hour * 60 + wall.minute;
  const top = (minutes / (24 * 60)) * gridHeight;
  const leftPct = (todayIdx / model.days.length) * 100;
  const widthPct = 100 / model.days.length;

  return h(
    "div",
    {
      class: "cal-now",
      style: { top: `${top}px`, left: `${leftPct}%`, width: `${widthPct}%` },
      "aria-hidden": "true",
    },
    [h("span", { class: "cal-now__dot" })],
  );
}
