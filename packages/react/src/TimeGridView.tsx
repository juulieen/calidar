/**
 * Time-grid view for the day / days / week kinds.
 *
 * Layout: an hour gutter on the left, a sticky all-day band on top, then a
 * scrollable grid of day columns. Timed events are absolutely positioned from
 * the fractional geometry the core layout produced; multi-day & all-day events
 * render as banded rows. A "now" line tracks the current instant.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DayBand, DragMode, EventInstance, TimedLayout } from "@calidar/core";
import { epochToPlainDate, epochToWall } from "@calidar/core";
import type { TimeGridViewModel } from "@calidar/core";
import { useCalendarContext } from "./context.js";
import { useGridDrag, type ActiveDrag } from "./useGridDrag.js";
import { useDayDrag, type ActiveDayDrag } from "./useDayDrag.js";
import { useCommitEdit } from "./useCommitEdit.js";
import { RecurrenceScopePopover } from "./RecurrenceScopePopover.js";
import { formatHour, formatTime, formatWeekdayShort } from "./format.js";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const COLUMN_GAP_PCT = 4; // horizontal breathing room between overlap columns

interface Props {
  model: TimeGridViewModel;
}

export function TimeGridView({ model }: Props): JSX.Element {
  const { snapshot, onEventCreate, onEventClick, onSelectSlot } =
    useCalendarContext();
  const { hourHeight, timeZone, days, allDayBands, allDayLaneCount } = model;
  const gridHeight = 24 * hourHeight;

  const scrollRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const allDayLanesRef = useRef<HTMLDivElement>(null);

  const edit = useCommitEdit();

  // Measure the scrollbar gutter so the header / all-day rows can reserve the
  // exact same width and stay aligned with the scrollable day columns.
  const [scrollbarW, setScrollbarW] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth - el.clientWidth;
      setScrollbarW((prev) => (prev === w ? prev : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-scroll to ~7am on first mount / view change.
  const didScroll = useRef(false);
  useLayoutEffect(() => {
    if (didScroll.current || !scrollRef.current) return;
    didScroll.current = true;
    scrollRef.current.scrollTop = Math.max(0, 7 * hourHeight - 16);
  }, [hourHeight]);

  const metrics = useCallback(
    () => ({ hourHeight, dayStarts: days.map((d) => d.dayStart) }),
    [days, hourHeight],
  );

  const gridTop = useCallback(() => {
    return columnsRef.current?.getBoundingClientRect().top ?? 0;
  }, []);

  const columnAt = useCallback(
    (clientX: number): number => {
      const el = columnsRef.current;
      if (!el || days.length === 0) return 0;
      const rect = el.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      return Math.floor(frac * days.length);
    },
    [days.length],
  );

  const onCommit = useCallback(
    (drag: ActiveDrag) => {
      const { preview, instance } = drag;
      if (instance === null) {
        onEventCreate?.({ start: preview.start, end: preview.end, allDay: false });
        return;
      }
      edit.commit(instance, { start: preview.start, end: preview.end });
    },
    [edit, onEventCreate],
  );

  const onClick = useCallback(
    (eventId: string | null, _dayIndex: number, instant: number) => {
      if (eventId === null) {
        onSelectSlot?.({ start: instant, end: instant + 30 * 60_000 });
      }
    },
    [onSelectSlot],
  );

  const drag = useGridDrag({ metrics, gridTop, columnAt, onCommit, onClick });

  // ---- All-day band: whole-day drag/create/resize ----------------------
  const allDayCells = useCallback(
    () => days.map((d) => ({ dayStart: d.dayStart, dayEnd: d.dayEnd })),
    [days],
  );

  const allDayColumnAt = useCallback(
    (clientX: number): number => {
      const el = allDayLanesRef.current;
      if (!el || days.length === 0) return 0;
      const rect = el.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      return Math.floor(frac * days.length);
    },
    [days.length],
  );

  const onAllDayCommit = useCallback(
    (c: { start: number; end: number; instance: EventInstance | null }) => {
      if (c.instance === null) {
        onEventCreate?.({ start: c.start, end: c.end, allDay: true });
        return;
      }
      edit.commit(c.instance, { start: c.start, end: c.end });
    },
    [edit, onEventCreate],
  );

  const onAllDayClick = useCallback(
    (instance: EventInstance | null) => {
      if (instance) onEventClick?.(instance);
    },
    [onEventClick],
  );

  const allDayDrag = useDayDrag({
    cells: allDayCells,
    columnAt: allDayColumnAt,
    onCommit: onAllDayCommit,
    onClick: onAllDayClick,
  });

  return (
    <div
      className="cal-timegrid"
      style={{
        ["--cal-hour-height" as string]: `${hourHeight}px`,
        ["--cal-scrollbar" as string]: `${scrollbarW}px`,
      }}
    >
      {/* Header row: gutter spacer + weekday labels */}
      <div className="cal-timegrid__head" role="row">
        <div className="cal-timegrid__gutter-spacer" aria-hidden="true" />
        <div className="cal-timegrid__day-heads">
          {days.map((day) => (
            <DayHead key={day.dayStart} day={day} />
          ))}
        </div>
      </div>

      {/* All-day band */}
      {allDayLaneCount > 0 && (
        <div className="cal-timegrid__allday" role="row">
          <div className="cal-timegrid__gutter-spacer cal-timegrid__allday-label" aria-hidden="true">
            all-day
          </div>
          <div
            ref={allDayLanesRef}
            className="cal-timegrid__allday-lanes"
            style={{ height: `${Math.max(allDayLaneCount, 1) * 26 + 6}px` }}
            onPointerDown={(e) => {
              if (e.button !== 0 && e.pointerType === "mouse") return;
              allDayDrag.startCreate(e, allDayColumnAt(e.clientX));
            }}
          >
            {allDayBands.map((band) => (
              <AllDayBand
                key={band.instance.key}
                band={band}
                dayCount={days.length}
                onStart={(e, mode) =>
                  allDayDrag.startEvent(e, band.instance, mode, band.startCol, band.endCol)
                }
                onClickEvent={onEventClick}
              />
            ))}

            {/* Live preview ghost for the all-day band */}
            {allDayDrag.active && (
              <AllDayPreview active={allDayDrag.active} dayCount={days.length} />
            )}
          </div>
        </div>
      )}

      {/* Scrollable grid */}
      <div className="cal-timegrid__scroll" ref={scrollRef}>
        <div className="cal-timegrid__body" style={{ height: `${gridHeight}px` }}>
          {/* Hour gutter */}
          <div className="cal-timegrid__gutter" aria-hidden="true">
            {HOURS.map((h) => (
              <div key={h} className="cal-timegrid__hour" style={{ height: `${hourHeight}px` }}>
                <span className="cal-timegrid__hour-label">{h === 0 ? "" : formatHour(h)}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="cal-timegrid__columns" ref={columnsRef} role="presentation">
            {/* Hour gridlines */}
            <div className="cal-timegrid__lines" aria-hidden="true">
              {HOURS.map((h) => (
                <div key={h} className="cal-timegrid__line" style={{ height: `${hourHeight}px` }} />
              ))}
            </div>

            {days.map((day, dayIndex) => (
              <div
                key={day.dayStart}
                className={`cal-col${day.isToday ? " cal-col--today" : ""}${
                  day.isWeekend ? " cal-col--weekend" : ""
                }`}
                role="gridcell"
                aria-label={`${formatWeekdayShort(day.date)} ${day.date.day}`}
                onPointerDown={(e) => {
                  // Only start a create gesture on empty space (events stopPropagation).
                  if (e.button !== 0 && e.pointerType === "mouse") return;
                  drag.startCreate(e, dayIndex);
                }}
                style={{ width: `${100 / days.length}%` }}
              >
                {day.timed.map((layout) => (
                  <TimedEvent
                    key={layout.instance.key}
                    layout={layout}
                    gridHeight={gridHeight}
                    timeZone={timeZone}
                    onClickEvent={onEventClick}
                    onStart={(e, mode) => drag.startEvent(e, layout.instance, mode, dayIndex)}
                  />
                ))}

                {/* Live preview ghost for this column */}
                {drag.active && drag.active.dayIndex === dayIndex && (
                  <PreviewGhost active={drag.active} day={day} gridHeight={gridHeight} timeZone={timeZone} />
                )}
              </div>
            ))}

            <NowLine model={model} gridHeight={gridHeight} now={snapshot.now} />
          </div>
        </div>
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

interface AllDayBandProps {
  band: DayBand;
  dayCount: number;
  onStart: (e: React.PointerEvent, mode: "move" | "resize-start" | "resize-end") => void;
  onClickEvent?: (instance: EventInstance) => void;
}

function AllDayBand({ band, dayCount, onStart, onClickEvent }: AllDayBandProps): JSX.Element {
  const span = band.endCol - band.startCol + 1;
  const editable = band.instance.editable !== false;
  return (
    <div
      className={`cal-band cal-band--allday${editable ? "" : " cal-band--locked"}`}
      role="button"
      tabIndex={0}
      style={{
        left: `${(band.startCol / dayCount) * 100}%`,
        width: `${(span / dayCount) * 100}%`,
        top: `${band.lane * 26}px`,
        ["--cal-event-color" as string]: band.instance.color || undefined,
      }}
      onPointerDown={(e) => {
        if (!editable) return;
        if (e.button !== 0 && e.pointerType === "mouse") return;
        onStart(e, "move");
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClickEvent?.(band.instance);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClickEvent?.(band.instance);
        }
      }}
      title={band.instance.title}
    >
      {editable && !band.continuesBefore && (
        <span
          className="cal-band__handle cal-band__handle--start"
          onPointerDown={(e) => {
            e.stopPropagation();
            onStart(e, "resize-start");
          }}
        />
      )}
      <span className="cal-band__title">
        {band.continuesBefore ? "‹ " : ""}
        {band.instance.title}
        {band.continuesAfter ? " ›" : ""}
      </span>
      {editable && !band.continuesAfter && (
        <span
          className="cal-band__handle cal-band__handle--end"
          onPointerDown={(e) => {
            e.stopPropagation();
            onStart(e, "resize-end");
          }}
        />
      )}
    </div>
  );
}

function AllDayPreview({
  active,
  dayCount,
}: {
  active: ActiveDayDrag;
  dayCount: number;
}): JSX.Element {
  const span = active.endCol - active.startCol + 1;
  return (
    <div
      className="cal-band cal-band--allday cal-band--preview"
      style={{
        left: `${(active.startCol / dayCount) * 100}%`,
        width: `${(span / dayCount) * 100}%`,
        top: `${0}px`,
      }}
    />
  );
}

function DayHead({ day }: { day: TimeGridViewModel["days"][number] }): JSX.Element {
  return (
    <div
      className={`cal-day-head${day.isToday ? " cal-day-head--today" : ""}`}
      role="columnheader"
    >
      <span className="cal-day-head__name">{formatWeekdayShort(day.date)}</span>
      <span className="cal-day-head__num">{day.date.day}</span>
    </div>
  );
}

interface TimedEventProps {
  layout: TimedLayout;
  gridHeight: number;
  timeZone: string;
  onClickEvent?: (instance: EventInstance) => void;
  onStart: (e: React.PointerEvent, mode: DragMode) => void;
}

function TimedEvent({
  layout,
  gridHeight,
  timeZone,
  onClickEvent,
  onStart,
}: TimedEventProps): JSX.Element {
  const { instance } = layout;
  const topPx = layout.top * gridHeight;
  const heightPx = Math.max(layout.height * gridHeight, 16);
  const widthPct = layout.width * 100;
  const leftPct = layout.left * 100;
  const editable = instance.editable !== false;

  return (
    <div
      className={`cal-event${editable ? "" : " cal-event--locked"}`}
      role="button"
      tabIndex={0}
      aria-label={`${instance.title}, ${formatTime(instance.start, timeZone)}`}
      style={{
        top: `${topPx}px`,
        height: `${heightPx}px`,
        left: `calc(${leftPct}% + 1px)`,
        width: `calc(${widthPct}% - ${COLUMN_GAP_PCT}px)`,
        ["--cal-event-color" as string]: instance.color || undefined,
      }}
      onPointerDown={(e) => onStart(e, "move")}
      onClick={(e) => {
        e.stopPropagation();
        onClickEvent?.(instance);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClickEvent?.(instance);
        }
      }}
    >
      {editable && (
        <span
          className="cal-event__handle cal-event__handle--top"
          onPointerDown={(e) => {
            e.stopPropagation();
            onStart(e, "resize-start");
          }}
        />
      )}
      <span className="cal-event__time">{formatTime(instance.start, timeZone)}</span>
      <span className="cal-event__title">{instance.title}</span>
      {editable && (
        <span
          className="cal-event__handle cal-event__handle--bottom"
          onPointerDown={(e) => {
            e.stopPropagation();
            onStart(e, "resize-end");
          }}
        />
      )}
    </div>
  );
}

function PreviewGhost({
  active,
  day,
  gridHeight,
  timeZone,
}: {
  active: ActiveDrag;
  day: TimeGridViewModel["days"][number];
  gridHeight: number;
  timeZone: string;
}): JSX.Element {
  const { preview } = active;
  const dayMs = day.dayEnd - day.dayStart;
  const top = ((preview.start - day.dayStart) / dayMs) * gridHeight;
  const height = Math.max(((preview.end - preview.start) / dayMs) * gridHeight, 16);
  return (
    <div className="cal-event cal-event--preview" style={{ top: `${top}px`, height: `${height}px` }}>
      <span className="cal-event__time">{formatTime(preview.start, timeZone)}</span>
    </div>
  );
}

function NowLine({
  model,
  gridHeight,
  now,
}: {
  model: TimeGridViewModel;
  gridHeight: number;
  now: number;
}): JSX.Element | null {
  // Re-tick the "now" line each minute so it drifts down realistically.
  const [tick, setTick] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const current = Math.max(now, tick);

  const todayIdx = model.days.findIndex((d) => d.isToday);
  if (todayIdx === -1) return null;
  const day = model.days[todayIdx]!;
  if (current < day.dayStart || current >= day.dayEnd) return null;

  void epochToPlainDate; // (kept for parity with core helpers)
  const wall = epochToWall(current, model.timeZone);
  const minutes = wall.hour * 60 + wall.minute;
  const top = (minutes / (24 * 60)) * gridHeight;
  const leftPct = (todayIdx / model.days.length) * 100;
  const widthPct = 100 / model.days.length;

  return (
    <div
      className="cal-now"
      style={{ top: `${top}px`, left: `${leftPct}%`, width: `${widthPct}%` }}
      aria-hidden="true"
    >
      <span className="cal-now__dot" />
    </div>
  );
}
