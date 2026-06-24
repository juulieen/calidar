/**
 * Resources view (Solid port) — a per-resource planning grid for the focal day,
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
 *    confirmed (cancel reverts it cleanly).
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

export function ResourcesView(props: Props): JSX.Element {
  const { snapshot, callbacks } = useCalendarContext();
  const model = (): ResourceViewModel => props.model;
  const columns = (): ResourceColumnModel[] => props.model.columns;
  const hourHeight = (): number => props.model.hourHeight;
  const gridHeight = (): number => 24 * hourHeight();

  let scrollRef: HTMLDivElement | undefined;
  let columnsRef: HTMLDivElement | undefined;

  const edit = useCommitEdit();

  // Measure the scrollbar gutter so the header / all-day rows reserve the exact
  // same width and stay aligned with the scrollable resource columns.
  const [scrollbarW, setScrollbarW] = createSignal(0);
  let didScroll = false;
  onMount(() => {
    const el = scrollRef;
    if (!el) return;
    const measure = (): void => {
      const w = el.offsetWidth - el.clientWidth;
      setScrollbarW((prev) => (prev === w ? prev : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    onCleanup(() => ro.disconnect());

    // Auto-scroll to ~7am on first mount.
    if (!didScroll) {
      didScroll = true;
      el.scrollTop = Math.max(0, 7 * hourHeight() - 16);
    }
  });

  // Every resource column shares the focal day, so all `dayStarts` are equal.
  // The hovered column index therefore identifies the *resource* under the
  // pointer (used below for cross-column reassignment), while the time maths
  // stays identical to the standard grid.
  const metrics = (): { hourHeight: number; dayStarts: number[] } => ({
    hourHeight: hourHeight(),
    dayStarts: columns().map((c) => c.dayStart),
  });

  const gridTop = (): number => columnsRef?.getBoundingClientRect().top ?? 0;

  const columnAt = (clientX: number): number => {
    const el = columnsRef;
    const cols = columns();
    if (!el || cols.length === 0) return 0;
    const rect = el.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    return Math.floor(frac * cols.length);
  };

  const onCommit = (d: ActiveDrag): void => {
    const { preview, instance } = d;
    const cols = columns();
    if (instance === null) {
      const resource = cols[d.dayIndex]?.resource;
      callbacks.onEventCreate?.({
        start: preview.start,
        end: preview.end,
        allDay: false,
        ...(resource ? { resourceId: resource.id } : {}),
      });
      return;
    }
    // Reassign the resource when the gesture lands on a different column. The
    // resourceId is folded into the patch so that recurring instances defer the
    // change until the scope popover is confirmed (cancel reverts it cleanly).
    const targetResource = cols[d.dayIndex]?.resource;
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
      const resource = columns()[dayIndex]?.resource;
      callbacks.onSelectSlot?.({
        start: instant,
        end: instant + 30 * 60_000,
        ...(resource ? { resourceId: resource.id } : {}),
      });
    }
  };

  const drag = useGridDrag({ metrics, gridTop, columnAt, onCommit, onClick });

  const allDayCount = (): number =>
    columns().reduce((max, c) => Math.max(max, c.allDay.length), 0);

  return (
    <div
      class="cal-timegrid cal-resources"
      style={{
        "--cal-hour-height": `${hourHeight()}px`,
        "--cal-scrollbar": `${scrollbarW()}px`,
      }}
    >
      {/* Header row: gutter spacer + resource names */}
      <div class="cal-timegrid__head" role="row">
        <div class="cal-timegrid__gutter-spacer" aria-hidden="true" />
        <div class="cal-timegrid__day-heads">
          <For each={columns()}>
            {(col) => <ResourceHead resource={col.resource} />}
          </For>
        </div>
      </div>

      {/* All-day band: one stacked cell per resource column. */}
      <Show when={allDayCount() > 0}>
        <div class="cal-timegrid__allday" role="row">
          <div
            class="cal-timegrid__gutter-spacer cal-timegrid__allday-label"
            aria-hidden="true"
          >
            all-day
          </div>
          <div
            class="cal-timegrid__allday-lanes cal-resources__allday"
            style={{ height: `${Math.max(allDayCount(), 1) * 26 + 6}px` }}
          >
            <For each={columns()}>
              {(col) => (
                <div
                  class="cal-resources__allday-col"
                  style={{ width: `${100 / columns().length}%` }}
                >
                  <For each={col.allDay}>
                    {(inst) => (
                      <ResourceAllDay
                        instance={inst}
                        onClickEvent={callbacks.onEventClick}
                      />
                    )}
                  </For>
                </div>
              )}
            </For>
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

          {/* Resource columns */}
          <div class="cal-timegrid__columns" ref={columnsRef} role="presentation">
            {/* Hour gridlines */}
            <div class="cal-timegrid__lines" aria-hidden="true">
              <For each={HOURS}>
                {() => (
                  <div
                    class="cal-timegrid__line"
                    style={{ height: `${hourHeight()}px` }}
                  />
                )}
              </For>
            </div>

            <For each={columns()}>
              {(col, colIndex) => (
                <div
                  class="cal-col"
                  classList={{ "cal-col--today": model().isToday }}
                  aria-label={col.resource.title}
                  onPointerDown={(e) => {
                    if (e.button !== 0 && e.pointerType === "mouse") return;
                    drag.startCreate(e, colIndex());
                  }}
                  style={{ width: `${100 / columns().length}%` }}
                >
                  <For each={col.timed}>
                    {(layout) => (
                      <TimedEvent
                        layout={layout}
                        gridHeight={gridHeight()}
                        timeZone={model().timeZone}
                        onClickEvent={callbacks.onEventClick}
                        onStart={(e, mode) =>
                          drag.startEvent(e, layout.instance, mode, colIndex())
                        }
                      />
                    )}
                  </For>

                  {/* Live preview ghost for this column */}
                  <Show
                    when={
                      drag.active() && drag.active()!.dayIndex === colIndex()
                    }
                  >
                    <PreviewGhost
                      active={drag.active()!}
                      col={col}
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

function ResourceHead(props: {
  resource: ResourceColumnModel["resource"];
}): JSX.Element {
  return (
    <div class="cal-day-head cal-resource-head" role="columnheader">
      <Show when={props.resource.color}>
        <span
          class="cal-resource-head__dot"
          style={{ background: props.resource.color }}
          aria-hidden="true"
        />
      </Show>
      <span class="cal-resource-head__name">{props.resource.title}</span>
    </div>
  );
}

function ResourceAllDay(props: {
  instance: EventInstance;
  onClickEvent?: (instance: EventInstance) => void;
}): JSX.Element {
  const editable = (): boolean => props.instance.editable !== false;
  return (
    <div
      class="cal-band cal-band--allday cal-resources__band"
      classList={{ "cal-band--locked": !editable() }}
      role="button"
      tabindex={0}
      style={{ "--cal-event-color": props.instance.color || undefined }}
      onClick={(e) => {
        e.stopPropagation();
        props.onClickEvent?.(props.instance);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClickEvent?.(props.instance);
        }
      }}
      title={props.instance.title}
    >
      <span class="cal-band__title">{props.instance.title}</span>
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
  col: ResourceColumnModel;
  gridHeight: number;
  timeZone: string;
}): JSX.Element {
  const preview = (): ActiveDrag["preview"] => props.active.preview;
  const dayMs = (): number => props.col.dayEnd - props.col.dayStart;
  const top = (): number =>
    ((preview().start - props.col.dayStart) / dayMs()) * props.gridHeight;
  const height = (): number =>
    Math.max(
      ((preview().end - preview().start) / dayMs()) * props.gridHeight,
      16,
    );
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
  model: ResourceViewModel;
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
    if (!model.isToday) return null;
    const range = model.range;
    if (current < range.start || current >= range.end) return null;

    const wall = epochToWall(current, model.timeZone);
    const minutes = wall.hour * 60 + wall.minute;
    const top = (minutes / (24 * 60)) * props.gridHeight;
    return { top };
  });

  return (
    <Show when={data()}>
      {(d) => (
        <div
          class="cal-now"
          style={{ top: `${d().top}px`, left: "0", width: "100%" }}
          aria-hidden="true"
        >
          <span class="cal-now__dot" />
        </div>
      )}
    </Show>
  );
}
