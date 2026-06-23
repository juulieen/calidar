/**
 * Month view: a stable 6×7 grid. Each week row packs its multi-day bands into
 * lanes; days that overflow the visible lane budget show a "+N" affordance.
 *
 * Interaction: bands can be dragged across days (whole-day snapping) and a new
 * all-day event can be sketched by dragging over empty cells. Each band also
 * exposes left/right resize handles that grow or shrink the span a whole day at
 * a time; because the gesture is mapped against the *entire* 6×7 grid (clientX
 * **and** clientY → a flat day index), a resize can flow past the end of a week
 * onto the following rows. A drag/resize that lands on a recurring instance
 * opens the scope popover.
 */
import { useCallback, useRef } from "react";
import type { EventInstance, MonthViewModel, MonthWeekModel } from "@calidar/core";
import { addDays } from "@calidar/core";
import { useCalendarContext } from "./context.js";
import { useDayDrag, type ActiveDayDrag } from "./useDayDrag.js";
import { useCommitEdit } from "./useCommitEdit.js";
import { RecurrenceScopePopover } from "./RecurrenceScopePopover.js";

const MAX_LANES = 4; // bands shown per day before collapsing into "+N"
const LANE_HEIGHT = 20;
const COLS = 7;

interface Props {
  model: MonthViewModel;
}

export function MonthView({ model }: Props): JSX.Element {
  const { store, onEventClick, onEventCreate, formatters } = useCalendarContext();
  const { formatWeekdayShort } = formatters;
  const { weekStartsOn } = store.getState();

  const edit = useCommitEdit();
  const gridRef = useRef<HTMLDivElement>(null);

  // Build weekday headers from the first week's dates.
  const firstWeek = model.weeks[0];
  const headerDates = firstWeek ? firstWeek.days.map((d) => d.date) : [];
  void weekStartsOn;
  void addDays;

  const onPickDay = useCallback(
    (dayStart: number) => {
      store.setCursor(dayStart + 12 * 3_600_000);
      store.setView("day");
    },
    [store],
  );

  const onCommit = useCallback(
    (c: { start: number; end: number; instance: EventInstance | null }) => {
      if (c.instance === null) {
        onEventCreate?.({ start: c.start, end: c.end, allDay: true });
        return;
      }
      edit.commit(c.instance, { start: c.start, end: c.end });
    },
    [edit, onEventCreate],
  );

  // ---- Grid-wide day mapping ------------------------------------------------
  // Flatten every week's days into a single 0..(weeks*7-1) lane so a resize can
  // run off the end of one row and continue on the next. Global index for a day
  // in week `w`, column `c` is `w * 7 + c`.
  const weeks = model.weeks;

  const cells = useCallback(
    () => weeks.flatMap((week) => week.days.map((d) => ({ dayStart: d.dayStart, dayEnd: d.dayEnd }))),
    [weeks],
  );

  const columnAt = useCallback(
    (clientX: number, clientY: number): number => {
      const el = gridRef.current;
      if (!el || weeks.length === 0) return 0;
      const rect = el.getBoundingClientRect();
      const colFrac = (clientX - rect.left) / rect.width;
      const col = Math.max(0, Math.min(COLS - 1, Math.floor(colFrac * COLS)));
      const rowFrac = (clientY - rect.top) / rect.height;
      const row = Math.max(0, Math.min(weeks.length - 1, Math.floor(rowFrac * weeks.length)));
      return row * COLS + col;
    },
    [weeks.length],
  );

  // One grid-wide drag controller: cells span all 6 rows so create/move/resize
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
        const day = weeks[w]?.days[c];
        if (day) onPickDay(day.dayStart);
      }
    },
  });

  return (
    <div className="cal-month" role="grid" aria-label="Month">
      <div className="cal-month__head" role="row">
        {headerDates.map((date) => (
          <div key={`${date.year}-${date.month}-${date.day}`} className="cal-month__head-cell" role="columnheader">
            {formatWeekdayShort(date)}
          </div>
        ))}
      </div>
      <div className="cal-month__grid" ref={gridRef}>
        {weeks.map((week, wi) => (
          <MonthWeek
            key={wi}
            week={week}
            weekIndex={wi}
            drag={drag}
            columnAt={columnAt}
            onEventClick={(inst) => onEventClick?.(inst)}
          />
        ))}

        {/* Live preview ghost spanning whole rows when a gesture is active. */}
        {drag.active && <MonthPreview active={drag.active} weekCount={weeks.length} />}
      </div>

      {edit.pending && (
        <RecurrenceScopePopover
          title={edit.pending.instance.title}
          onChoose={(scope) => edit.resolve(scope)}
          onCancel={() => edit.cancel()}
        />
      )}
    </div>
  );
}

function MonthWeek({
  week,
  weekIndex,
  drag,
  columnAt,
  onEventClick,
}: {
  week: MonthWeekModel;
  weekIndex: number;
  drag: ReturnType<typeof useDayDrag>;
  columnAt: (clientX: number, clientY: number) => number;
  onEventClick: (inst: EventInstance) => void;
}): JSX.Element {
  const lanes = Math.min(week.laneCount, MAX_LANES);
  const visibleBands = week.bands.filter((b) => b.lane < lanes);
  const base = weekIndex * COLS; // global index of this week's first column

  // Count hidden bands per day column for the "+N more" indicator.
  const hidden = new Array(COLS).fill(0) as number[];
  for (const band of week.bands) {
    if (band.lane >= lanes) {
      for (let c = band.startCol; c <= band.endCol; c++) hidden[c] = (hidden[c] ?? 0) + 1;
    }
  }

  return (
    <div className="cal-month__week" role="row">
      {/* Day cells */}
      <div
        className="cal-month__days"
        onPointerDown={(e) => {
          if (e.button !== 0 && e.pointerType === "mouse") return;
          drag.startCreate(e, columnAt(e.clientX, e.clientY));
        }}
      >
        {week.days.map((day) => (
          <div
            key={day.dayStart}
            className={[
              "cal-month__day",
              day.inMonth ? "" : "cal-month__day--out",
              day.isToday ? "cal-month__day--today" : "",
              day.isWeekend ? "cal-month__day--weekend" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="gridcell"
          >
            <span className="cal-month__daynum">{day.date.day}</span>
          </div>
        ))}
      </div>

      {/* Banded overlay positioned over the day cells */}
      <div className="cal-month__bands" style={{ height: `${lanes * LANE_HEIGHT}px` }}>
        {visibleBands.map((band) => {
          const span = band.endCol - band.startCol + 1;
          const editable = band.instance.editable !== false;
          const globalStart = base + band.startCol;
          const globalEnd = base + band.endCol;
          return (
            <div
              key={band.instance.key}
              className={`cal-band cal-band--month${editable ? "" : " cal-band--locked"}`}
              role="button"
              tabIndex={0}
              style={{
                left: `calc(${(band.startCol / COLS) * 100}% + 2px)`,
                width: `calc(${(span / COLS) * 100}% - 4px)`,
                top: `${band.lane * LANE_HEIGHT}px`,
                ["--cal-event-color" as string]: band.instance.color || undefined,
              }}
              title={band.instance.title}
              onPointerDown={(e) => {
                if (!editable) return;
                if (e.button !== 0 && e.pointerType === "mouse") return;
                drag.startEvent(e, band.instance, "move", globalStart, globalEnd);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick(band.instance);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEventClick(band.instance);
                }
              }}
            >
              {/* Left handle: only when the event truly begins on this row. */}
              {editable && !band.continuesBefore && (
                <span
                  className="cal-band__handle cal-band__handle--start"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (e.button !== 0 && e.pointerType === "mouse") return;
                    drag.startEvent(e, band.instance, "resize-start", globalStart, globalEnd);
                  }}
                />
              )}
              <span className="cal-band__title">
                {band.continuesBefore ? "‹ " : ""}
                {band.instance.title}
                {band.continuesAfter ? " ›" : ""}
              </span>
              {/* Right handle: only when the event truly ends on this row. */}
              {editable && !band.continuesAfter && (
                <span
                  className="cal-band__handle cal-band__handle--end"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (e.button !== 0 && e.pointerType === "mouse") return;
                    drag.startEvent(e, band.instance, "resize-end", globalStart, globalEnd);
                  }}
                />
              )}
            </div>
          );
        })}

        {hidden.map((count, col) =>
          count > 0 ? (
            <span
              key={`more-${col}`}
              className="cal-month__more"
              style={{ left: `${(col / COLS) * 100}%`, width: `${(1 / COLS) * 100}%` }}
            >
              +{count}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

/**
 * Preview ghost for an active month gesture. The previewed span is a flat
 * range of global day indices, so it may cover several week rows. Draw one
 * segment per spanned row, positioned absolutely over the whole grid.
 */
function MonthPreview({
  active,
  weekCount,
}: {
  active: ActiveDayDrag;
  weekCount: number;
}): JSX.Element {
  const segments: JSX.Element[] = [];
  const firstRow = Math.floor(active.startCol / COLS);
  const lastRow = Math.floor(active.endCol / COLS);
  const rowHeight = 100 / Math.max(weekCount, 1);

  for (let row = firstRow; row <= lastRow; row++) {
    const startCol = row === firstRow ? active.startCol % COLS : 0;
    const endCol = row === lastRow ? active.endCol % COLS : COLS - 1;
    const span = endCol - startCol + 1;
    segments.push(
      <div
        key={row}
        className="cal-band cal-band--month cal-band--preview cal-band--month-preview"
        style={{
          left: `calc(${(startCol / COLS) * 100}% + 2px)`,
          width: `calc(${(span / COLS) * 100}% - 4px)`,
          top: `calc(${row * rowHeight}% + 32px)`,
        }}
      />,
    );
  }
  return <>{segments}</>;
}
