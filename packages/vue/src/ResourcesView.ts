/**
 * Resources view (Vue port) — a per-resource planning grid for the focal day,
 * in the style of Google Calendar "rooms". One column per configured resource,
 * all sharing the same day. Reuses the time-grid DOM/classes (hour gutter,
 * all-day band, absolutely-positioned timed events) so the visual language and
 * scrollbar alignment match the standard views.
 *
 * This is a *local* adapter mode, not a store `view`: the root component drives
 * it and feeds the precomputed `ResourceViewModel` in.
 *
 * Interactions:
 *  - Timed move/resize/create inside a column changes the hour, exactly like the
 *    time grid (shared `useGridDrag` + `useCommitEdit`).
 *  - Dragging a timed event onto a *different* resource column reassigns its
 *    `resourceId` in addition to any time change. The change is folded into the
 *    `useCommitEdit` patch so recurring instances defer it until scope is
 *    confirmed.
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
  DragMode,
  EventInstance,
  ResourceColumnModel,
  ResourceViewModel,
  TimedLayout,
} from "@calidar/core";
import { epochToWall } from "@calidar/core";
import { useCalendarContext } from "./context.js";
import { useGridDrag, type ActiveDrag } from "./useGridDrag.js";
import { useCommitEdit } from "./useCommitEdit.js";
import { RecurrenceScopePopover } from "./RecurrenceScopePopover.js";
import type { Formatters } from "./format.js";

type FormatTime = Formatters["formatTime"];

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const COLUMN_GAP_PCT = 4; // horizontal breathing room between overlap columns

export const ResourcesView = defineComponent({
  name: "ResourcesView",
  props: {
    model: { type: Object as PropType<ResourceViewModel>, required: true },
  },
  setup(props) {
    const { snapshot, onEventCreate, onEventClick, onSelectSlot, formatters } =
      useCalendarContext();

    const edit = useCommitEdit();

    const scrollRef = ref<HTMLDivElement | null>(null);
    const columnsRef = ref<HTMLDivElement | null>(null);

    // Measure the scrollbar gutter so the header / all-day rows reserve the
    // exact same width and stay aligned with the scrollable resource columns.
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

    // Every resource column shares the focal day, so all `dayStarts` are equal.
    // The hovered column index therefore identifies the *resource* under the
    // pointer (used below for cross-column reassignment), while the time maths
    // stays identical to the standard grid.
    const metrics = () => ({
      hourHeight: props.model.hourHeight,
      dayStarts: props.model.columns.map((c) => c.dayStart),
    });

    const gridTop = (): number =>
      columnsRef.value?.getBoundingClientRect().top ?? 0;

    const columnAt = (clientX: number): number => {
      const el = columnsRef.value;
      const columns = props.model.columns;
      if (!el || columns.length === 0) return 0;
      const rect = el.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      return Math.floor(frac * columns.length);
    };

    const onCommit = (d: ActiveDrag): void => {
      const { preview, instance } = d;
      const columns = props.model.columns;
      if (instance === null) {
        const resource = columns[d.dayIndex]?.resource;
        onEventCreate?.({
          start: preview.start,
          end: preview.end,
          allDay: false,
          ...(resource ? { resourceId: resource.id } : {}),
        });
        return;
      }
      // Reassign the resource when the gesture lands on a different column. The
      // resourceId is folded into the patch so recurring instances defer the
      // change until the scope popover is confirmed (cancel reverts it
      // cleanly). Non-recurring instances commit immediately via
      // useCommitEdit's store.updateEvent path.
      const targetResource = columns[d.dayIndex]?.resource;
      const movedResource =
        targetResource != null &&
        targetResource.id !== instance.resourceId &&
        instance.editable !== false;
      edit.commit(instance, {
        start: preview.start,
        end: preview.end,
        ...(movedResource ? { resourceId: targetResource!.id } : {}),
      });
    };

    const onClick = (
      eventId: string | null,
      dayIndex: number,
      instant: number,
    ): void => {
      if (eventId === null) {
        const resource = props.model.columns[dayIndex]?.resource;
        onSelectSlot?.({
          start: instant,
          end: instant + 30 * 60_000,
          ...(resource ? { resourceId: resource.id } : {}),
        });
      }
    };

    const drag = useGridDrag({ metrics, gridTop, columnAt, onCommit, onClick });

    return () => {
      const { formatHour, formatTime } = formatters.value;
      const model = props.model;
      const { hourHeight, timeZone, columns } = model;
      const gridHeight = 24 * hourHeight;
      const allDayCount = columns.reduce(
        (max, c) => Math.max(max, c.allDay.length),
        0,
      );

      const children: VNode[] = [
        // Header row: gutter spacer + resource names
        h("div", { class: "cal-timegrid__head", role: "row" }, [
          h("div", {
            class: "cal-timegrid__gutter-spacer",
            "aria-hidden": "true",
          }),
          h(
            "div",
            { class: "cal-timegrid__day-heads" },
            columns.map((col) => renderResourceHead(col.resource)),
          ),
        ]),
      ];

      // All-day band: one stacked cell per resource column.
      if (allDayCount > 0) {
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
                class: "cal-timegrid__allday-lanes cal-resources__allday",
                style: { height: `${Math.max(allDayCount, 1) * 26 + 6}px` },
              },
              columns.map((col) =>
                h(
                  "div",
                  {
                    key: col.resource.id,
                    class: "cal-resources__allday-col",
                    style: { width: `${100 / columns.length}%` },
                  },
                  col.allDay.map((inst) =>
                    renderResourceAllDay(inst, onEventClick),
                  ),
                ),
              ),
            ),
          ]),
        );
      }

      // Scrollable grid
      children.push(
        h("div", { class: "cal-timegrid__scroll", ref: scrollRef }, [
          h(
            "div",
            {
              class: "cal-timegrid__body",
              style: { height: `${gridHeight}px` },
            },
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
              // Resource columns
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
                  ...columns.map((col, colIndex) =>
                    renderColumn(
                      col,
                      colIndex,
                      columns.length,
                      gridHeight,
                      timeZone,
                      model.isToday,
                      drag,
                      onEventClick,
                      formatTime,
                    ),
                  ),
                  renderNowLine(
                    model,
                    gridHeight,
                    Math.max(snapshot.value.now, nowTick.value),
                  ),
                ],
              ),
            ],
          ),
        ]),
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
          class: "cal-timegrid cal-resources",
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

function renderResourceHead(
  resource: ResourceColumnModel["resource"],
): VNode {
  return h(
    "div",
    {
      key: resource.id,
      class: "cal-day-head cal-resource-head",
      role: "columnheader",
    },
    [
      resource.color
        ? h("span", {
            class: "cal-resource-head__dot",
            style: { background: resource.color },
            "aria-hidden": "true",
          })
        : null,
      h("span", { class: "cal-resource-head__name" }, resource.title),
    ],
  );
}

function renderResourceAllDay(
  instance: EventInstance,
  onEventClick: ((instance: EventInstance) => void) | undefined,
): VNode {
  const editable = instance.editable !== false;
  return h(
    "div",
    {
      key: instance.key,
      class: `cal-band cal-band--allday cal-resources__band${
        editable ? "" : " cal-band--locked"
      }`,
      role: "button",
      tabindex: 0,
      style: { "--cal-event-color": instance.color || undefined },
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
      title: instance.title,
    },
    [h("span", { class: "cal-band__title" }, instance.title)],
  );
}

function renderColumn(
  col: ResourceColumnModel,
  colIndex: number,
  colCount: number,
  gridHeight: number,
  timeZone: string,
  isToday: boolean,
  drag: ReturnType<typeof useGridDrag>,
  onEventClick: ((instance: EventInstance) => void) | undefined,
  formatTime: FormatTime,
): VNode {
  const colChildren: (VNode | null)[] = col.timed.map((layout) =>
    renderTimedEvent(
      layout,
      gridHeight,
      timeZone,
      drag,
      colIndex,
      onEventClick,
      formatTime,
    ),
  );

  const active = drag.active.value;
  if (active && active.dayIndex === colIndex) {
    colChildren.push(
      renderPreviewGhost(active, col, gridHeight, timeZone, formatTime),
    );
  }

  return h(
    "div",
    {
      key: col.resource.id,
      class: `cal-col${isToday ? " cal-col--today" : ""}`,
      "aria-label": col.resource.title,
      role: "gridcell",
      onPointerdown: (e: PointerEvent) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        drag.startCreate(e, colIndex);
      },
      style: { width: `${100 / colCount}%` },
    },
    colChildren,
  );
}

function renderTimedEvent(
  layout: TimedLayout,
  gridHeight: number,
  timeZone: string,
  drag: ReturnType<typeof useGridDrag>,
  colIndex: number,
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
    drag.startEvent(e, instance, mode, colIndex);

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
  col: ResourceColumnModel,
  gridHeight: number,
  timeZone: string,
  formatTime: FormatTime,
): VNode {
  const { preview } = active;
  const dayMs = col.dayEnd - col.dayStart;
  const top = ((preview.start - col.dayStart) / dayMs) * gridHeight;
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

function renderNowLine(
  model: ResourceViewModel,
  gridHeight: number,
  current: number,
): VNode | null {
  if (!model.isToday) return null;
  const range = model.range;
  if (current < range.start || current >= range.end) return null;

  const wall = epochToWall(current, model.timeZone);
  const minutes = wall.hour * 60 + wall.minute;
  const top = (minutes / (24 * 60)) * gridHeight;

  return h(
    "div",
    {
      class: "cal-now",
      style: { top: `${top}px`, left: "0", width: "100%" },
      "aria-hidden": "true",
    },
    [h("span", { class: "cal-now__dot" })],
  );
}
