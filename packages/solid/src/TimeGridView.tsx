/**
 * Time-grid view for the day / days / week kinds (Solid port).
 *
 * Layout: an hour gutter on the left, a sticky all-day band on top, then a
 * scrollable grid of day columns. Timed events are absolutely positioned from
 * the fractional geometry the core layout produced; multi-day & all-day events
 * render as banded rows. A "now" line tracks the current instant.
 */
import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
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
import { formatHour, formatTime, formatWeekdayShort } from "./format.js";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const COLUMN_GAP_PCT = 4; // horizontal breathing room between overlap columns

interface Props {
  model: TimeGridViewModel;
}

export function TimeGridView(props: Props): JSX.Element {
  const { snapshot, callbacks } = useCalendarContext();
  const model = (): TimeGridViewModel => props.model;
  const days = (): TimeGridViewModel["days"] => props.model.days;
  const hourHeight = (): number => props.model.hourHeight;
  const gridHeight = (): number => 24 * hourHeight();

  let scrollRef: HTMLDivElement | undefined;
  let columnsRef: HTMLDivElement | undefined;
  let allDayLanesRef: HTMLDivElement | undefined;

  const edit = useCommitEdit();

  // Measure the scrollbar gutter so the header / all-day rows can reserve the
  // exact same width and stay aligned with the scrollable day columns.
  const [scrollbarW, setScrollbarW] = createSignal(0);
  // Auto-scroll to ~7am on first mount.
  let didScroll = false;
  onMount(() => {
    const el = scrollRef;
    if (el) {
      const measure = (): void => {
        const w = el.offsetWidth - el.clientWidth;
        setScrollbarW((prev) => (prev === w ? prev : w));
      };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      onCleanup(() => ro.disconnect());

      if (!didScroll) {
        didScroll = true;
        el.scrollTop = Math.max(0, 7 * hourHeight() - 16);
      }
    }
  });

  const metrics = (): { hourHeight: number; dayStarts: number[] } => ({
    hourHeight: hourHeight(),
    dayStarts: days().map((d) => d.dayStart),
  });

  const gridTop = (): number =>
    columnsRef?.getBoundingClientRect().top ?? 0;

  const columnAt = (clientX: number): number => {
    const el = columnsRef;
    if (!el || days().length === 0) return 0;
    const rect = el.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    return Math.floor(frac * days().length);
  };

  const onCommit = (drag: ActiveDrag): void => {
    const { preview, instance } = drag;
    if (instance === null) {
      callbacks.onEventCreate?.({
        start: preview.start,
        end: preview.end,
        allDay: false,
      });
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
      callbacks.onSelectSlot?.({ start: instant, end: instant + 30 * 60_000 });
    }
  };

  const drag = useGridDrag({ metrics, gridTop, columnAt, onCommit, onClick });

  // ---- All-day band: whole-day drag/create/resize ----------------------
  const allDayCells = (): { dayStart: number; dayEnd: number }[] =>
    days().map((d) => ({ dayStart: d.dayStart, dayEnd: d.dayEnd }));

  const allDayColumnAt = (clientX: number): number => {
    const el = allDayLanesRef;
    if (!el || days().length === 0) return 0;
    const rect = el.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    return Math.floor(frac * days().length);
  };

  const onAllDayCommit = (c: {
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

  const onAllDayClick = (instance: EventInstance | null): void => {
    if (instance) callbacks.onEventClick?.(instance);
  };

  const allDayDrag = useDayDrag({
    cells: allDayCells,
    columnAt: allDayColumnAt,
    onCommit: onAllDayCommit,
    onClick: onAllDayClick,
  });

  return (
    <div
      class="cal-timegrid"
      style={{
        "--cal-hour-height": `${hourHeight()}px`,
        "--cal-scrollbar": `${scrollbarW()}px`,
      }}
    >
      {/* Header row: gutter spacer + weekday labels */}
      <div class="cal-timegrid__head" role="row">
        <div class="cal-timegrid__gutter-spacer" aria-hidden="true" />
        <div class="cal-timegrid__day-heads">
          <For each={days()}>{(day) => <DayHead day={day} />}</For>
        </div>
      </div>

      {/* All-day band */}
      <Show when={model().allDayLaneCount > 0}>
        <div class="cal-timegrid__allday" role="row">
          <div
            class="cal-timegrid__gutter-spacer cal-timegrid__allday-label"
            aria-hidden="true"
          >
            all-day
          </div>
          <div
            ref={allDayLanesRef}
            class="cal-timegrid__allday-lanes"
            style={{
              height: `${Math.max(model().allDayLaneCount, 1) * 26 + 6}px`,
            }}
            onPointerDown={(e) => {
              if (e.button !== 0 && e.pointerType === "mouse") return;
              allDayDrag.startCreate(e, allDayColumnAt(e.clientX));
            }}
          >
            <For each={model().allDayBands}>
              {(band) => (
                <AllDayBand
                  band={band}
                  dayCount={days().length}
                  onStart={(e, mode) =>
                    allDayDrag.startEvent(
                      e,
                      band.instance,
                      mode,
                      band.startCol,
                      band.endCol,
                    )
                  }
                  onClickEvent={callbacks.onEventClick}
                />
              )}
            </For>

            {/* Live preview ghost for the all-day band */}
            <Show when={allDayDrag.active()}>
              {(active) => (
                <AllDayPreview active={active()} dayCount={days().length} />
              )}
            </Show>
          </div>
        </div>
      </Show>

      {/* Scrollable grid */}
      <div class="cal-timegrid__scroll" ref={scrollRef}>
        <div class="cal-timegrid__body" style={{ height: `${gridHeight()}px` }}>
          {/* Hour gutter */}
          <div class="cal-timegrid__gutter" aria-hidden="true">
            <For each={HOURS}>
              {(h) => (
                <div
                  class="cal-timegrid__hour"
                  style={{ height: `${hourHeight()}px` }}
                >
                  <span class="cal-timegrid__hour-label">
                    {h === 0 ? "" : formatHour(h)}
                  </span>
                </div>
              )}
            </For>
          </div>

          {/* Day columns */}
          <div class="cal-timegrid__columns" ref={columnsRef} role="presentation">
            {/* Hour gridlines */}
            <div class="cal-timegrid__lines" aria-hidden="true">
              <For each={HOURS}>
                {(_h) => (
                  <div
                    class="cal-timegrid__line"
                    style={{ height: `${hourHeight()}px` }}
                  />
                )}
              </For>
            </div>

            <For each={days()}>
              {(day, dayIndex) => (
                <div
                  class="cal-col"
                  classList={{
                    "cal-col--today": day.isToday,
                    "cal-col--weekend": day.isWeekend,
                  }}
                  role="gridcell"
                  aria-label={`${formatWeekdayShort(day.date)} ${day.date.day}`}
                  onPointerDown={(e) => {
                    // Only start a create gesture on empty space (events stopPropagation).
                    if (e.button !== 0 && e.pointerType === "mouse") return;
                    drag.startCreate(e, dayIndex());
                  }}
                  style={{ width: `${100 / days().length}%` }}
                >
                  <For each={day.timed}>
                    {(layout) => (
                      <TimedEvent
                        layout={layout}
                        gridHeight={gridHeight()}
                        timeZone={model().timeZone}
                        onClickEvent={callbacks.onEventClick}
                        onStart={(e, mode) =>
                          drag.startEvent(e, layout.instance, mode, dayIndex())
                        }
                      />
                    )}
                  </For>

                  {/* Live preview ghost for this column */}
                  <Show
                    when={
                      drag.active() && drag.active()!.dayIndex === dayIndex()
                    }
                  >
                    <PreviewGhost
                      active={drag.active()!}
                      day={day}
                      gridHeight={gridHeight()}
                      timeZone={model().timeZone}
                    />
                  </Show>
                </div>
              )}
            </For>

            <NowLine
              model={model()}
              gridHeight={gridHeight()}
              now={snapshot().now}
            />
          </div>
        </div>
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

interface AllDayBandProps {
  band: DayBand;
  dayCount: number;
  onStart: (
    e: PointerEvent,
    mode: "move" | "resize-start" | "resize-end",
  ) => void;
  onClickEvent?: (instance: EventInstance) => void;
}

function AllDayBand(props: AllDayBandProps): JSX.Element {
  const span = (): number => props.band.endCol - props.band.startCol + 1;
  const editable = (): boolean => props.band.instance.editable !== false;
  return (
    <div
      class="cal-band cal-band--allday"
      classList={{ "cal-band--locked": !editable() }}
      role="button"
      tabindex={0}
      style={{
        left: `${(props.band.startCol / props.dayCount) * 100}%`,
        width: `${(span() / props.dayCount) * 100}%`,
        top: `${props.band.lane * 26}px`,
        "--cal-event-color": props.band.instance.color || undefined,
      }}
      onPointerDown={(e) => {
        if (!editable()) return;
        if (e.button !== 0 && e.pointerType === "mouse") return;
        props.onStart(e, "move");
      }}
      onClick={(e) => {
        e.stopPropagation();
        props.onClickEvent?.(props.band.instance);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClickEvent?.(props.band.instance);
        }
      }}
      title={props.band.instance.title}
    >
      <Show when={editable() && !props.band.continuesBefore}>
        <span
          class="cal-band__handle cal-band__handle--start"
          onPointerDown={(e) => {
            e.stopPropagation();
            props.onStart(e, "resize-start");
          }}
        />
      </Show>
      <span class="cal-band__title">
        {props.band.continuesBefore ? "‹ " : ""}
        {props.band.instance.title}
        {props.band.continuesAfter ? " ›" : ""}
      </span>
      <Show when={editable() && !props.band.continuesAfter}>
        <span
          class="cal-band__handle cal-band__handle--end"
          onPointerDown={(e) => {
            e.stopPropagation();
            props.onStart(e, "resize-end");
          }}
        />
      </Show>
    </div>
  );
}

function AllDayPreview(props: {
  active: ActiveDayDrag;
  dayCount: number;
}): JSX.Element {
  const span = (): number => props.active.endCol - props.active.startCol + 1;
  return (
    <div
      class="cal-band cal-band--allday cal-band--preview"
      style={{
        left: `${(props.active.startCol / props.dayCount) * 100}%`,
        width: `${(span() / props.dayCount) * 100}%`,
        top: `0px`,
      }}
    />
  );
}

function DayHead(props: {
  day: TimeGridViewModel["days"][number];
}): JSX.Element {
  return (
    <div
      class="cal-day-head"
      classList={{ "cal-day-head--today": props.day.isToday }}
      role="columnheader"
    >
      <span class="cal-day-head__name">
        {formatWeekdayShort(props.day.date)}
      </span>
      <span class="cal-day-head__num">{props.day.date.day}</span>
    </div>
  );
}

interface TimedEventProps {
  layout: TimedLayout;
  gridHeight: number;
  timeZone: string;
  onClickEvent?: (instance: EventInstance) => void;
  onStart: (e: PointerEvent, mode: DragMode) => void;
}

function TimedEvent(props: TimedEventProps): JSX.Element {
  const instance = (): EventInstance => props.layout.instance;
  const topPx = (): number => props.layout.top * props.gridHeight;
  const heightPx = (): number =>
    Math.max(props.layout.height * props.gridHeight, 16);
  const widthPct = (): number => props.layout.width * 100;
  const leftPct = (): number => props.layout.left * 100;
  const editable = (): boolean => instance().editable !== false;

  return (
    <div
      class="cal-event"
      classList={{ "cal-event--locked": !editable() }}
      role="button"
      tabindex={0}
      aria-label={`${instance().title}, ${formatTime(instance().start, props.timeZone)}`}
      style={{
        top: `${topPx()}px`,
        height: `${heightPx()}px`,
        left: `calc(${leftPct()}% + 1px)`,
        width: `calc(${widthPct()}% - ${COLUMN_GAP_PCT}px)`,
        "--cal-event-color": instance().color || undefined,
      }}
      onPointerDown={(e) => props.onStart(e, "move")}
      onClick={(e) => {
        e.stopPropagation();
        props.onClickEvent?.(instance());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClickEvent?.(instance());
        }
      }}
    >
      <Show when={editable()}>
        <span
          class="cal-event__handle cal-event__handle--top"
          onPointerDown={(e) => {
            e.stopPropagation();
            props.onStart(e, "resize-start");
          }}
        />
      </Show>
      <span class="cal-event__time">
        {formatTime(instance().start, props.timeZone)}
      </span>
      <span class="cal-event__title">{instance().title}</span>
      <Show when={editable()}>
        <span
          class="cal-event__handle cal-event__handle--bottom"
          onPointerDown={(e) => {
            e.stopPropagation();
            props.onStart(e, "resize-end");
          }}
        />
      </Show>
    </div>
  );
}

function PreviewGhost(props: {
  active: ActiveDrag;
  day: TimeGridViewModel["days"][number];
  gridHeight: number;
  timeZone: string;
}): JSX.Element {
  const preview = (): ActiveDrag["preview"] => props.active.preview;
  const dayMs = (): number => props.day.dayEnd - props.day.dayStart;
  const top = (): number =>
    ((preview().start - props.day.dayStart) / dayMs()) * props.gridHeight;
  const height = (): number =>
    Math.max(((preview().end - preview().start) / dayMs()) * props.gridHeight, 16);
  return (
    <div
      class="cal-event cal-event--preview"
      style={{ top: `${top()}px`, height: `${height()}px` }}
    >
      <span class="cal-event__time">
        {formatTime(preview().start, props.timeZone)}
      </span>
    </div>
  );
}

function NowLine(props: {
  model: TimeGridViewModel;
  gridHeight: number;
  now: number;
}): JSX.Element {
  // Re-tick the "now" line each minute so it drifts down realistically.
  const [tick, setTick] = createSignal(props.now);
  onMount(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    onCleanup(() => clearInterval(id));
  });

  const data = createMemo(() => {
    const current = Math.max(props.now, tick());
    const model = props.model;
    const todayIdx = model.days.findIndex((d) => d.isToday);
    if (todayIdx === -1) return null;
    const day = model.days[todayIdx]!;
    if (current < day.dayStart || current >= day.dayEnd) return null;

    const wall = epochToWall(current, model.timeZone);
    const minutes = wall.hour * 60 + wall.minute;
    const top = (minutes / (24 * 60)) * props.gridHeight;
    const leftPct = (todayIdx / model.days.length) * 100;
    const widthPct = 100 / model.days.length;
    return { top, leftPct, widthPct };
  });

  return (
    <Show when={data()}>
      {(d) => (
        <div
          class="cal-now"
          style={{
            top: `${d().top}px`,
            left: `${d().leftPct}%`,
            width: `${d().widthPct}%`,
          }}
          aria-hidden="true"
        >
          <span class="cal-now__dot" />
        </div>
      )}
    </Show>
  );
}
