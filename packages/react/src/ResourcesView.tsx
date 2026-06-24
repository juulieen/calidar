/**
 * Resources view — a per-resource planning grid for the focal day, in the style
 * of Google Calendar "rooms". One column per configured resource, all sharing
 * the same day. Reuses the time-grid DOM/classes (hour gutter, all-day band,
 * absolutely-positioned timed events) so the visual language and scrollbar
 * alignment match the standard views.
 *
 * This is a *local* adapter mode, not a store `view`: the root component drives
 * it and feeds the precomputed `ResourceViewModel` in.
 *
 * Interactions:
 *  - Timed move/resize/create inside a column changes the hour, exactly like the
 *    time grid (shared `useGridDrag` + `useCommitEdit`).
 *  - Dragging a timed event onto a *different* resource column reassigns its
 *    `resourceId` in addition to any time change. The change is folded into the
 *    `useCommitEdit` patch so recurring instances defer it until scope is confirmed.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
import { formatHour, formatTime } from "./format.js";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const COLUMN_GAP_PCT = 4; // horizontal breathing room between overlap columns

interface Props {
  model: ResourceViewModel;
}

export function ResourcesView({ model }: Props): JSX.Element {
  const { snapshot, onEventCreate, onEventClick, onSelectSlot } =
    useCalendarContext();
  const { hourHeight, timeZone, columns } = model;
  const gridHeight = 24 * hourHeight;

  const scrollRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  const edit = useCommitEdit();

  // Measure the scrollbar gutter so the header / all-day rows reserve the exact
  // same width and stay aligned with the scrollable resource columns.
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

  // Auto-scroll to ~7am on first mount.
  const didScroll = useRef(false);
  useLayoutEffect(() => {
    if (didScroll.current || !scrollRef.current) return;
    didScroll.current = true;
    scrollRef.current.scrollTop = Math.max(0, 7 * hourHeight - 16);
  }, [hourHeight]);

  // Every resource column shares the focal day, so all `dayStarts` are equal.
  // The hovered column index therefore identifies the *resource* under the
  // pointer (used below for cross-column reassignment), while the time maths
  // stays identical to the standard grid.
  const metrics = useCallback(
    () => ({ hourHeight, dayStarts: columns.map((c) => c.dayStart) }),
    [columns, hourHeight],
  );

  const gridTop = useCallback(() => {
    return columnsRef.current?.getBoundingClientRect().top ?? 0;
  }, []);

  const columnAt = useCallback(
    (clientX: number): number => {
      const el = columnsRef.current;
      if (!el || columns.length === 0) return 0;
      const rect = el.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      return Math.floor(frac * columns.length);
    },
    [columns.length],
  );

  const onCommit = useCallback(
    (d: ActiveDrag) => {
      const { preview, instance } = d;
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
      // Reassign the resource when the gesture lands on a different column.
      // The resourceId is folded into the patch so that recurring instances
      // defer the change until the scope popover is confirmed (cancel reverts
      // it cleanly). Non-recurring instances commit immediately via
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
    },
    [columns, edit, onEventCreate],
  );

  const onClick = useCallback(
    (eventId: string | null, dayIndex: number, instant: number) => {
      if (eventId === null) {
        const resource = columns[dayIndex]?.resource;
        onSelectSlot?.({
          start: instant,
          end: instant + 30 * 60_000,
          ...(resource ? { resourceId: resource.id } : {}),
        });
      }
    },
    [columns, onSelectSlot],
  );

  const drag = useGridDrag({ metrics, gridTop, columnAt, onCommit, onClick });

  const allDayCount = columns.reduce(
    (max, c) => Math.max(max, c.allDay.length),
    0,
  );

  return (
    <div
      className="cal-timegrid cal-resources"
      style={{
        ["--cal-hour-height" as string]: `${hourHeight}px`,
        ["--cal-scrollbar" as string]: `${scrollbarW}px`,
      }}
    >
      {/* Header row: gutter spacer + resource names */}
      <div className="cal-timegrid__head" role="row">
        <div className="cal-timegrid__gutter-spacer" aria-hidden="true" />
        <div className="cal-timegrid__day-heads">
          {columns.map((col) => (
            <ResourceHead key={col.resource.id} resource={col.resource} />
          ))}
        </div>
      </div>

      {/* All-day band: one stacked cell per resource column. */}
      {allDayCount > 0 && (
        <div className="cal-timegrid__allday" role="row">
          <div
            className="cal-timegrid__gutter-spacer cal-timegrid__allday-label"
            aria-hidden="true"
          >
            all-day
          </div>
          <div
            className="cal-timegrid__allday-lanes cal-resources__allday"
            style={{ height: `${Math.max(allDayCount, 1) * 26 + 6}px` }}
          >
            {columns.map((col) => (
              <div
                key={col.resource.id}
                className="cal-resources__allday-col"
                style={{ width: `${100 / columns.length}%` }}
              >
                {col.allDay.map((inst) => (
                  <ResourceAllDay
                    key={inst.key}
                    instance={inst}
                    onClickEvent={onEventClick}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable grid */}
      <div className="cal-timegrid__scroll" ref={scrollRef}>
        <div className="cal-timegrid__body" style={{ height: `${gridHeight}px` }}>
          {/* Hour gutter */}
          <div className="cal-timegrid__gutter" aria-hidden="true">
            {HOURS.map((h) => (
              <div
                key={h}
                className="cal-timegrid__hour"
                style={{ height: `${hourHeight}px` }}
              >
                <span className="cal-timegrid__hour-label">
                  {h === 0 ? "" : formatHour(h)}
                </span>
              </div>
            ))}
          </div>

          {/* Resource columns */}
          <div
            className="cal-timegrid__columns"
            ref={columnsRef}
            role="presentation"
          >
            {/* Hour gridlines */}
            <div className="cal-timegrid__lines" aria-hidden="true">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="cal-timegrid__line"
                  style={{ height: `${hourHeight}px` }}
                />
              ))}
            </div>

            {columns.map((col, colIndex) => (
              <div
                key={col.resource.id}
                className={`cal-col${model.isToday ? " cal-col--today" : ""}`}
                aria-label={col.resource.title}
                onPointerDown={(e) => {
                  if (e.button !== 0 && e.pointerType === "mouse") return;
                  drag.startCreate(e, colIndex);
                }}
                style={{ width: `${100 / columns.length}%` }}
              >
                {col.timed.map((layout) => (
                  <TimedEvent
                    key={layout.instance.key}
                    layout={layout}
                    gridHeight={gridHeight}
                    timeZone={timeZone}
                    onClickEvent={onEventClick}
                    onStart={(e, mode) =>
                      drag.startEvent(e, layout.instance, mode, colIndex)
                    }
                  />
                ))}

                {/* Live preview ghost for this column */}
                {drag.active && drag.active.dayIndex === colIndex && (
                  <PreviewGhost
                    active={drag.active}
                    col={col}
                    gridHeight={gridHeight}
                    timeZone={timeZone}
                  />
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

function ResourceHead({
  resource,
}: {
  resource: ResourceColumnModel["resource"];
}): JSX.Element {
  return (
    <div className="cal-day-head cal-resource-head" role="columnheader">
      {resource.color && (
        <span
          className="cal-resource-head__dot"
          style={{ background: resource.color }}
          aria-hidden="true"
        />
      )}
      <span className="cal-resource-head__name">{resource.title}</span>
    </div>
  );
}

function ResourceAllDay({
  instance,
  onClickEvent,
}: {
  instance: EventInstance;
  onClickEvent?: (instance: EventInstance) => void;
}): JSX.Element {
  const editable = instance.editable !== false;
  return (
    <div
      className={`cal-band cal-band--allday cal-resources__band${
        editable ? "" : " cal-band--locked"
      }`}
      role="button"
      tabIndex={0}
      style={{ ["--cal-event-color" as string]: instance.color || undefined }}
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
      title={instance.title}
    >
      <span className="cal-band__title">{instance.title}</span>
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
  col,
  gridHeight,
  timeZone,
}: {
  active: ActiveDrag;
  col: ResourceColumnModel;
  gridHeight: number;
  timeZone: string;
}): JSX.Element {
  const { preview } = active;
  const dayMs = col.dayEnd - col.dayStart;
  const top = ((preview.start - col.dayStart) / dayMs) * gridHeight;
  const height = Math.max(
    ((preview.end - preview.start) / dayMs) * gridHeight,
    16,
  );
  return (
    <div
      className="cal-event cal-event--preview"
      style={{ top: `${top}px`, height: `${height}px` }}
    >
      <span className="cal-event__time">{formatTime(preview.start, timeZone)}</span>
    </div>
  );
}

function NowLine({
  model,
  gridHeight,
  now,
}: {
  model: ResourceViewModel;
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

  if (!model.isToday) return null;
  const range = model.range;
  if (current < range.start || current >= range.end) return null;

  const wall = epochToWall(current, model.timeZone);
  const minutes = wall.hour * 60 + wall.minute;
  const top = (minutes / (24 * 60)) * gridHeight;

  return (
    <div
      className="cal-now"
      style={{ top: `${top}px`, left: 0, width: "100%" }}
      aria-hidden="true"
    >
      <span className="cal-now__dot" />
    </div>
  );
}
