/**
 * Month view (Vue port): a stable 6×7 grid. Each week row packs its multi-day
 * bands into lanes; days that overflow the visible lane budget show a "+N"
 * affordance.
 *
 * Interaction: bands can be dragged across days (whole-day snapping) and a new
 * all-day event can be sketched by dragging over empty cells. Each band also
 * exposes left/right resize handles that grow or shrink the span a whole day at
 * a time; because the gesture is mapped against the *entire* 6×7 grid (clientX
 * **and** clientY → a flat day index), a resize can flow past the end of a week
 * onto the following rows. A drag/resize that lands on a recurring instance
 * opens the scope popover.
 */
import { defineComponent, Fragment, h, ref, type PropType, type VNode } from "vue";
import type {
  EventInstance,
  MonthViewModel,
  MonthWeekModel,
} from "@calidar/core";
import { useCalendarContext } from "./context.js";
import {
  useDayDrag,
  type ActiveDayDrag,
  type DayDragHandlers,
} from "./useDayDrag.js";
import { useCommitEdit } from "./useCommitEdit.js";
import { RecurrenceScopePopover } from "./RecurrenceScopePopover.js";

const MAX_LANES = 4; // bands shown per day before collapsing into "+N"
const LANE_HEIGHT = 20;
const COLS = 7;

export const MonthView = defineComponent({
  name: "MonthView",
  props: {
    model: { type: Object as PropType<MonthViewModel>, required: true },
  },
  setup(props) {
    const { store, onEventClick, onEventCreate, formatters } =
      useCalendarContext();
    const edit = useCommitEdit();
    const gridRef = ref<HTMLDivElement | null>(null);

    const onPickDay = (dayStart: number): void => {
      store.setCursor(dayStart + 12 * 3_600_000);
      store.setView("day");
    };

    const onCommit = (c: {
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

    // ---- Grid-wide day mapping --------------------------------------------
    // Flatten every week's days into a single 0..(weeks*7-1) lane so a resize
    // can run off the end of one row and continue on the next. Global index for
    // a day in week `w`, column `c` is `w * 7 + c`.
    const cells = () =>
      props.model.weeks.flatMap((week) =>
        week.days.map((d) => ({ dayStart: d.dayStart, dayEnd: d.dayEnd })),
      );

    const columnAt = (clientX: number, clientY: number): number => {
      const el = gridRef.value;
      const weeks = props.model.weeks;
      if (!el || weeks.length === 0) return 0;
      const rect = el.getBoundingClientRect();
      const colFrac = (clientX - rect.left) / rect.width;
      const col = Math.max(0, Math.min(COLS - 1, Math.floor(colFrac * COLS)));
      const rowFrac = (clientY - rect.top) / rect.height;
      const row = Math.max(
        0,
        Math.min(weeks.length - 1, Math.floor(rowFrac * weeks.length)),
      );
      return row * COLS + col;
    };

    // One grid-wide drag controller: cells span all rows so create/move/resize
    // gestures can flow across week boundaries.
    const drag = useDayDrag({
      cells,
      columnAt,
      onCommit,
      onClick: (instance, globalCol) => {
        if (instance) onEventClick?.(instance);
        else {
          const w = Math.floor(globalCol / COLS);
          const c = globalCol % COLS;
          const day = props.model.weeks[w]?.days[c];
          if (day) onPickDay(day.dayStart);
        }
      },
    });

    return () => {
      const { formatWeekdayShort } = formatters.value;
      const weeks = props.model.weeks;
      const firstWeek = weeks[0];
      const headerDates = firstWeek ? firstWeek.days.map((d) => d.date) : [];

      const children: VNode[] = [
        h(
          "div",
          { class: "cal-month__head", role: "row" },
          headerDates.map((date) =>
            h(
              "div",
              {
                key: `${date.year}-${date.month}-${date.day}`,
                class: "cal-month__head-cell",
                role: "columnheader",
              },
              formatWeekdayShort(date),
            ),
          ),
        ),
        h(
          "div",
          { class: "cal-month__grid", ref: gridRef },
          [
            ...weeks.map((week, wi) =>
              renderWeek(week, wi, drag, columnAt, onEventClick),
            ),
            // Live preview ghost spanning whole rows when a gesture is active.
            drag.active.value
              ? renderPreview(drag.active.value, weeks.length)
              : null,
          ],
        ),
      ];

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
        { class: "cal-month", role: "grid", "aria-label": "Month" },
        children,
      );
    };
  },
});

function renderWeek(
  week: MonthWeekModel,
  weekIndex: number,
  drag: DayDragHandlers,
  columnAt: (clientX: number, clientY: number) => number,
  onEventClick: ((inst: EventInstance) => void) | undefined,
): VNode {
  const lanes = Math.min(week.laneCount, MAX_LANES);
  const visibleBands = week.bands.filter((b) => b.lane < lanes);
  const base = weekIndex * COLS; // global index of this week's first column

  // Count hidden bands per day column for the "+N more" indicator.
  const hidden = new Array(COLS).fill(0) as number[];
  for (const band of week.bands) {
    if (band.lane >= lanes) {
      for (let c = band.startCol; c <= band.endCol; c++)
        hidden[c] = (hidden[c] ?? 0) + 1;
    }
  }

  const dayCells = h(
    "div",
    {
      class: "cal-month__days",
      onPointerdown: (e: PointerEvent) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        drag.startCreate(e, columnAt(e.clientX, e.clientY));
      },
    },
    week.days.map((day) =>
      h(
        "div",
        {
          key: day.dayStart,
          class: [
            "cal-month__day",
            day.inMonth ? "" : "cal-month__day--out",
            day.isToday ? "cal-month__day--today" : "",
            day.isWeekend ? "cal-month__day--weekend" : "",
          ]
            .filter(Boolean)
            .join(" "),
          role: "gridcell",
        },
        [h("span", { class: "cal-month__daynum" }, String(day.date.day))],
      ),
    ),
  );

  const bandChildren: (VNode | null)[] = visibleBands.map((band) => {
    const span = band.endCol - band.startCol + 1;
    const editable = band.instance.editable !== false;
    const globalStart = base + band.startCol;
    const globalEnd = base + band.endCol;
    return h(
      "div",
      {
        key: band.instance.key,
        class: `cal-band cal-band--month${editable ? "" : " cal-band--locked"}`,
        role: "button",
        tabindex: 0,
        style: {
          left: `calc(${(band.startCol / COLS) * 100}% + 2px)`,
          width: `calc(${(span / COLS) * 100}% - 4px)`,
          top: `${band.lane * LANE_HEIGHT}px`,
          "--cal-event-color": band.instance.color || undefined,
        },
        title: band.instance.title,
        onPointerdown: (e: PointerEvent) => {
          if (!editable) return;
          if (e.button !== 0 && e.pointerType === "mouse") return;
          drag.startEvent(e, band.instance, "move", globalStart, globalEnd);
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
      },
      [
        // Left handle: only when the event truly begins on this row.
        editable && !band.continuesBefore
          ? h("span", {
              class: "cal-band__handle cal-band__handle--start",
              onPointerdown: (e: PointerEvent) => {
                e.stopPropagation();
                if (e.button !== 0 && e.pointerType === "mouse") return;
                drag.startEvent(
                  e,
                  band.instance,
                  "resize-start",
                  globalStart,
                  globalEnd,
                );
              },
            })
          : null,
        h("span", { class: "cal-band__title" }, [
          band.continuesBefore ? "‹ " : "",
          band.instance.title,
          band.continuesAfter ? " ›" : "",
        ]),
        // Right handle: only when the event truly ends on this row.
        editable && !band.continuesAfter
          ? h("span", {
              class: "cal-band__handle cal-band__handle--end",
              onPointerdown: (e: PointerEvent) => {
                e.stopPropagation();
                if (e.button !== 0 && e.pointerType === "mouse") return;
                drag.startEvent(
                  e,
                  band.instance,
                  "resize-end",
                  globalStart,
                  globalEnd,
                );
              },
            })
          : null,
      ],
    );
  });

  hidden.forEach((count, col) => {
    if (count > 0) {
      bandChildren.push(
        h(
          "span",
          {
            key: `more-${col}`,
            class: "cal-month__more",
            style: {
              left: `${(col / COLS) * 100}%`,
              width: `${(1 / COLS) * 100}%`,
            },
          },
          `+${count}`,
        ),
      );
    }
  });

  const bands = h(
    "div",
    { class: "cal-month__bands", style: { height: `${lanes * LANE_HEIGHT}px` } },
    bandChildren,
  );

  return h("div", { class: "cal-month__week", role: "row" }, [dayCells, bands]);
}

/**
 * Preview ghost for an active month gesture. The previewed span is a flat range
 * of global day indices, so it may cover several week rows. Draw one segment
 * per spanned row, positioned absolutely over the whole grid.
 */
function renderPreview(active: ActiveDayDrag, weekCount: number): VNode {
  const segments: VNode[] = [];
  const firstRow = Math.floor(active.startCol / COLS);
  const lastRow = Math.floor(active.endCol / COLS);
  const rowHeight = 100 / Math.max(weekCount, 1);

  for (let row = firstRow; row <= lastRow; row++) {
    const startCol = row === firstRow ? active.startCol % COLS : 0;
    const endCol = row === lastRow ? active.endCol % COLS : COLS - 1;
    const span = endCol - startCol + 1;
    segments.push(
      h("div", {
        key: row,
        class: "cal-band cal-band--month cal-band--preview cal-band--month-preview",
        style: {
          left: `calc(${(startCol / COLS) * 100}% + 2px)`,
          width: `calc(${(span / COLS) * 100}% - 4px)`,
          top: `calc(${row * rowHeight}% + 32px)`,
        },
      }),
    );
  }
  return h(Fragment, segments);
}
