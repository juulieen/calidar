/**
 * Month view (Solid port): a stable 6×7 grid. Each week row packs its multi-day
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
import { For, Show, type JSX } from "solid-js";
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
import { formatWeekdayShort } from "./format.js";

const MAX_LANES = 4; // bands shown per day before collapsing into "+N"
const LANE_HEIGHT = 20;
const COLS = 7;

interface Props {
  model: MonthViewModel;
}

export function MonthView(props: Props): JSX.Element {
  const { store, callbacks } = useCalendarContext();
  const weeks = (): MonthViewModel["weeks"] => props.model.weeks;

  const edit = useCommitEdit();
  let gridRef: HTMLDivElement | undefined;

  // Build weekday headers from the first week's dates.
  const headerDates = (): MonthViewModel["weeks"][number]["days"][number]["date"][] => {
    const firstWeek = weeks()[0];
    return firstWeek ? firstWeek.days.map((d) => d.date) : [];
  };

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
      callbacks.onEventCreate?.({ start: c.start, end: c.end, allDay: true });
      return;
    }
    edit.commit(c.instance, { start: c.start, end: c.end });
  };

  // ---- Grid-wide day mapping ------------------------------------------------
  // Flatten every week's days into a single 0..(weeks*7-1) lane so a resize can
  // run off the end of one row and continue on the next. Global index for a day
  // in week `w`, column `c` is `w * 7 + c`.
  const cells = (): { dayStart: number; dayEnd: number }[] =>
    weeks().flatMap((week) =>
      week.days.map((d) => ({ dayStart: d.dayStart, dayEnd: d.dayEnd })),
    );

  const columnAt = (clientX: number, clientY: number): number => {
    const el = gridRef;
    if (!el || weeks().length === 0) return 0;
    const rect = el.getBoundingClientRect();
    const colFrac = (clientX - rect.left) / rect.width;
    const col = Math.max(0, Math.min(COLS - 1, Math.floor(colFrac * COLS)));
    const rowFrac = (clientY - rect.top) / rect.height;
    const row = Math.max(
      0,
      Math.min(weeks().length - 1, Math.floor(rowFrac * weeks().length)),
    );
    return row * COLS + col;
  };

  // One grid-wide drag controller: cells span all 6 rows so create/move/resize
  // gestures can flow across week boundaries.
  const drag = useDayDrag({
    cells,
    columnAt,
    onCommit,
    onClick: (instance, globalCol) => {
      if (instance) callbacks.onEventClick?.(instance);
      else {
        const w = Math.floor(globalCol / COLS);
        const c = globalCol % COLS;
        const day = weeks()[w]?.days[c];
        if (day) onPickDay(day.dayStart);
      }
    },
  });

  return (
    <div class="cal-month" role="grid" aria-label="Month">
      <div class="cal-month__head" role="row">
        <For each={headerDates()}>
          {(date) => (
            <div class="cal-month__head-cell" role="columnheader">
              {formatWeekdayShort(date)}
            </div>
          )}
        </For>
      </div>
      <div class="cal-month__grid" ref={gridRef}>
        <For each={weeks()}>
          {(week, wi) => (
            <MonthWeek
              week={week}
              weekIndex={wi()}
              drag={drag}
              columnAt={columnAt}
              onEventClick={(inst) => callbacks.onEventClick?.(inst)}
            />
          )}
        </For>

        {/* Live preview ghost spanning whole rows when a gesture is active. */}
        <Show when={drag.active()}>
          {(active) => (
            <MonthPreview active={active()} weekCount={weeks().length} />
          )}
        </Show>
      </div>

      <Show when={edit.pending()}>
        {(pending) => (
          <RecurrenceScopePopover
            title={pending().instance.title}
            onChoose={(scope) => edit.resolve(scope)}
            onCancel={() => edit.cancel()}
          />
        )}
      </Show>
    </div>
  );
}

function MonthWeek(props: {
  week: MonthWeekModel;
  weekIndex: number;
  drag: DayDragHandlers;
  columnAt: (clientX: number, clientY: number) => number;
  onEventClick: (inst: EventInstance) => void;
}): JSX.Element {
  const lanes = (): number => Math.min(props.week.laneCount, MAX_LANES);
  const visibleBands = (): MonthWeekModel["bands"] =>
    props.week.bands.filter((b) => b.lane < lanes());
  const base = (): number => props.weekIndex * COLS; // global index of week's first column

  // Count hidden bands per day column for the "+N more" indicator.
  const hidden = (): number[] => {
    const arr = new Array(COLS).fill(0) as number[];
    for (const band of props.week.bands) {
      if (band.lane >= lanes()) {
        for (let c = band.startCol; c <= band.endCol; c++)
          arr[c] = (arr[c] ?? 0) + 1;
      }
    }
    return arr;
  };

  return (
    <div class="cal-month__week" role="row">
      {/* Day cells */}
      <div
        class="cal-month__days"
        onPointerDown={(e) => {
          if (e.button !== 0 && e.pointerType === "mouse") return;
          props.drag.startCreate(e, props.columnAt(e.clientX, e.clientY));
        }}
      >
        <For each={props.week.days}>
          {(day) => (
            <div
              class="cal-month__day"
              classList={{
                "cal-month__day--out": !day.inMonth,
                "cal-month__day--today": day.isToday,
                "cal-month__day--weekend": day.isWeekend,
              }}
              role="gridcell"
            >
              <span class="cal-month__daynum">{day.date.day}</span>
            </div>
          )}
        </For>
      </div>

      {/* Banded overlay positioned over the day cells */}
      <div
        class="cal-month__bands"
        style={{ height: `${lanes() * LANE_HEIGHT}px` }}
      >
        <For each={visibleBands()}>
          {(band) => {
            const span = (): number => band.endCol - band.startCol + 1;
            const editable = (): boolean => band.instance.editable !== false;
            const globalStart = (): number => base() + band.startCol;
            const globalEnd = (): number => base() + band.endCol;
            return (
              <div
                class="cal-band cal-band--month"
                classList={{ "cal-band--locked": !editable() }}
                role="button"
                tabindex={0}
                style={{
                  left: `calc(${(band.startCol / COLS) * 100}% + 2px)`,
                  width: `calc(${(span() / COLS) * 100}% - 4px)`,
                  top: `${band.lane * LANE_HEIGHT}px`,
                  "--cal-event-color": band.instance.color || undefined,
                }}
                title={band.instance.title}
                onPointerDown={(e) => {
                  if (!editable()) return;
                  if (e.button !== 0 && e.pointerType === "mouse") return;
                  props.drag.startEvent(
                    e,
                    band.instance,
                    "move",
                    globalStart(),
                    globalEnd(),
                  );
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onEventClick(band.instance);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    props.onEventClick(band.instance);
                  }
                }}
              >
                {/* Left handle: only when the event truly begins on this row. */}
                <Show when={editable() && !band.continuesBefore}>
                  <span
                    class="cal-band__handle cal-band__handle--start"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.button !== 0 && e.pointerType === "mouse") return;
                      props.drag.startEvent(
                        e,
                        band.instance,
                        "resize-start",
                        globalStart(),
                        globalEnd(),
                      );
                    }}
                  />
                </Show>
                <span class="cal-band__title">
                  {band.continuesBefore ? "‹ " : ""}
                  {band.instance.title}
                  {band.continuesAfter ? " ›" : ""}
                </span>
                {/* Right handle: only when the event truly ends on this row. */}
                <Show when={editable() && !band.continuesAfter}>
                  <span
                    class="cal-band__handle cal-band__handle--end"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.button !== 0 && e.pointerType === "mouse") return;
                      props.drag.startEvent(
                        e,
                        band.instance,
                        "resize-end",
                        globalStart(),
                        globalEnd(),
                      );
                    }}
                  />
                </Show>
              </div>
            );
          }}
        </For>

        <For each={hidden()}>
          {(count, col) => (
            <Show when={count > 0}>
              <span
                class="cal-month__more"
                style={{
                  left: `${(col() / COLS) * 100}%`,
                  width: `${(1 / COLS) * 100}%`,
                }}
              >
                +{count}
              </span>
            </Show>
          )}
        </For>
      </div>
    </div>
  );
}

/**
 * Preview ghost for an active month gesture. The previewed span is a flat
 * range of global day indices, so it may cover several week rows. Draw one
 * segment per spanned row, positioned absolutely over the whole grid.
 */
function MonthPreview(props: {
  active: ActiveDayDrag;
  weekCount: number;
}): JSX.Element {
  const rows = (): { row: number; startCol: number; span: number }[] => {
    const out: { row: number; startCol: number; span: number }[] = [];
    const firstRow = Math.floor(props.active.startCol / COLS);
    const lastRow = Math.floor(props.active.endCol / COLS);
    for (let row = firstRow; row <= lastRow; row++) {
      const startCol = row === firstRow ? props.active.startCol % COLS : 0;
      const endCol = row === lastRow ? props.active.endCol % COLS : COLS - 1;
      out.push({ row, startCol, span: endCol - startCol + 1 });
    }
    return out;
  };
  const rowHeight = (): number => 100 / Math.max(props.weekCount, 1);

  return (
    <For each={rows()}>
      {(seg) => (
        <div
          class="cal-band cal-band--month cal-band--preview cal-band--month-preview"
          style={{
            left: `calc(${(seg.startCol / COLS) * 100}% + 2px)`,
            width: `calc(${(seg.span / COLS) * 100}% - 4px)`,
            top: `calc(${seg.row * rowHeight()}% + 32px)`,
          }}
        />
      )}
    </For>
  );
}
