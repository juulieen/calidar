/**
 * Timeline view (Solid port): resources as rows, a HORIZONTAL time axis.
 *
 * Layout: a frozen left column lists the resources (colour pip + name), or a
 * single "All events" row when no resources are configured. To its right a
 * horizontally scrollable lane holds a time axis (graduations from the model's
 * `slots`), vertical gridlines aligned to those slots, and — per resource row —
 * the event bars positioned from the fractional `left`/`width` geometry the
 * core selector produced. Overlapping bars stack by `lane`; a "now" marker
 * tracks the current instant.
 *
 * Timeline is an adapter-LOCAL mode: it renders `computeTimelineView(...)`
 * without ever mutating `store.view`, exactly like the Resource view.
 *
 * Interactions (pointer): drag a bar horizontally to move it in time, drag the
 * left/right edge to resize, and drag vertically onto another resource row to
 * reassign `resourceId`. Pixel→time mapping snaps to 15-minute steps. Locked
 * (`editable === false`) bars are inert. Recurring instances defer to the scope
 * popover via the shared commit logic.
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
  CalendarEvent,
  EventInstance,
  TimelineBar,
  TimelineRowModel,
  TimelineViewModel,
} from "@calidar/core";
import { useCalendarContext } from "./context.js";
import { useCommitEdit } from "./useCommitEdit.js";
import { RecurrenceScopePopover } from "./RecurrenceScopePopover.js";
import { formatTime, timelineTickLabel } from "./format.js";

/** Height of one stacked bar lane, in px. */
const LANE_HEIGHT = 30;
/** Vertical padding reserved inside a row (top + bottom), in px. */
const ROW_PAD = 10;
/** Minimum row height, in px — keeps single-lane rows at a ≥44px touch target. */
const MIN_ROW_HEIGHT = 44;
/** Snap granularity for the time axis, in ms (15 minutes). */
const SNAP_MS = 15 * 60_000;
/** Pointer travel (px) before a press is treated as a drag rather than a click. */
const DRAG_THRESHOLD = 4;

interface Props {
  model: TimelineViewModel;
  now: number;
}

type DragKind = "move" | "resize-start" | "resize-end";

/** Live drag state shared with the preview overlay. */
interface ActiveDrag {
  kind: DragKind;
  instance: EventInstance;
  /** Row index the bar started in. */
  fromRow: number;
  /** Row index currently hovered (cross-row reassignment target). */
  toRow: number;
  /** Preview times after applying the gesture (epoch ms). */
  start: number;
  end: number;
  /** True once the pointer has moved past the click threshold. */
  moved: boolean;
}

function rowHeight(row: TimelineRowModel): number {
  return Math.max(
    Math.max(row.lanes, 1) * LANE_HEIGHT + ROW_PAD,
    MIN_ROW_HEIGHT,
  );
}

function snap(epoch: number): number {
  return Math.round(epoch / SNAP_MS) * SNAP_MS;
}

export function TimelineView(props: Props): JSX.Element {
  const { store, callbacks } = useCalendarContext();
  const model = (): TimelineViewModel => props.model;
  const rows = (): TimelineRowModel[] => props.model.rows;
  const slots = (): TimelineViewModel["slots"] => props.model.slots;
  const range = (): TimelineViewModel["range"] => props.model.range;
  const unit = (): TimelineViewModel["unit"] => props.model.unit;
  const timeZone = (): string => props.model.timeZone;
  const span = (): number => range().end - range().start;

  const edit = useCommitEdit();

  // Refs to the scrollable axis area and the stacked row track, used to map a
  // clientX → epoch instant and a clientY → row index during a drag.
  let axisRef: HTMLDivElement | undefined;
  let rowsRef: HTMLDivElement | undefined;

  const [active, setActiveState] = createSignal<ActiveDrag | null>(null);
  let activeRef: ActiveDrag | null = null;
  const setActive = (next: ActiveDrag | null): void => {
    activeRef = next;
    setActiveState(next);
  };

  // Map a clientX onto an epoch instant across the (possibly scrolled) axis.
  const instantAt = (clientX: number): number => {
    const el = axisRef;
    if (!el) return range().start;
    const rect = el.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    const clamped = Math.min(Math.max(frac, 0), 1);
    return range().start + clamped * span();
  };

  // Map a clientY onto a row index (for cross-row resource reassignment).
  // Exclude DragPreview (which has no role="row") so its rect doesn't trick the
  // hit-test into returning a row index beyond the real row list.
  const rowAt = (clientY: number): number => {
    const el = rowsRef;
    if (!el) return 0;
    const children = Array.from(el.children).filter(
      (c) => (c as HTMLElement).getAttribute("role") === "row",
    ) as HTMLElement[];
    for (let i = 0; i < children.length; i++) {
      const r = children[i]!.getBoundingClientRect();
      if (clientY >= r.top && clientY < r.bottom) return i;
    }
    // Above the first / below the last → clamp.
    return clientY < el.getBoundingClientRect().top ? 0 : rows().length - 1;
  };

  const beginDrag = (
    e: PointerEvent,
    instance: EventInstance,
    rowIndex: number,
    kind: DragKind,
  ): void => {
    if (instance.editable === false) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = instance.start;
    const origEnd = instance.end;
    const grabInstant = instantAt(startX);

    setActive({
      kind,
      instance,
      fromRow: rowIndex,
      toRow: rowIndex,
      start: origStart,
      end: origEnd,
      moved: false,
    });

    const onMove = (ev: PointerEvent): void => {
      const prev = activeRef;
      if (!prev) return;
      const moved =
        prev.moved ||
        Math.abs(ev.clientX - startX) > DRAG_THRESHOLD ||
        (kind === "move" && Math.abs(ev.clientY - startY) > DRAG_THRESHOLD);
      const pointer = instantAt(ev.clientX);
      let nextStart = prev.start;
      let nextEnd = prev.end;
      let toRow = prev.toRow;

      if (kind === "move") {
        // Snap the absolute result, not the delta, so the snapped position is
        // grid-aligned regardless of where inside a snap bucket the grab started.
        nextStart = snap(origStart + (pointer - grabInstant));
        nextEnd = nextStart + (origEnd - origStart);
        // Vertical travel reassigns the bar to another resource row.
        toRow = rowAt(ev.clientY);
      } else if (kind === "resize-start") {
        nextStart = Math.min(snap(pointer), origEnd - SNAP_MS);
        nextEnd = origEnd;
      } else {
        nextStart = origStart;
        nextEnd = Math.max(snap(pointer), origStart + SNAP_MS);
      }

      setActive({ ...prev, start: nextStart, end: nextEnd, toRow, moved });
    };

    const cleanup = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };

    const onUp = (): void => {
      cleanup();
      const final = activeRef;
      setActive(null);
      if (!final || !final.moved) return;

      const patch: Partial<CalendarEvent> = {
        start: final.start,
        end: final.end,
      };
      // Cross-row drag (move only): reassign the resource.
      if (kind === "move" && final.toRow !== final.fromRow) {
        const target = rows()[final.toRow]?.resource;
        if (target) patch.resourceId = target.id;
      }

      if (instance.recurring) {
        // Defer to the scope popover for the time change; also pass the
        // resourceId through the edit flow so the host is always notified.
        edit.commit(instance, {
          start: final.start,
          end: final.end,
          ...(patch.resourceId != null ? { resourceId: patch.resourceId } : {}),
        });
        return;
      }
      store.updateEvent(instance.eventId, patch);
      callbacks.onEventUpdate?.(instance.eventId, patch);
    };

    // pointercancel fires on touch-scroll interception or OS gestures. Cancel
    // the drag without committing any changes.
    const onCancel = (): void => {
      cleanup();
      setActive(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  // Auto-scroll the day axis toward ~7am on first mount so business hours show.
  // axisRef = .cal-timeline__lanes → .parentElement = .cal-timeline__track (no
  // overflow) → .parentElement = .cal-timeline__scroll (the actual scrollable).
  let didScroll = false;
  onMount(() => {
    if (didScroll || unit() !== "day") return;
    const el = axisRef?.parentElement?.parentElement;
    if (!el) return;
    didScroll = true;
    el.scrollLeft = Math.max(0, el.scrollWidth * (7 / 24) - 24);
  });

  // Keep a live "now" marker ticking each minute.
  const [tick, setTick] = createSignal(props.now);
  onMount(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    onCleanup(() => clearInterval(id));
  });
  const nowFrac = (): number | null => {
    const current = Math.max(props.now, tick());
    const r = range();
    return current >= r.start && current < r.end
      ? (current - r.start) / span()
      : null;
  };

  return (
    <div class="cal-timeline">
      <div class="cal-timeline__grid">
        {/* Frozen resource column */}
        <div class="cal-timeline__resources" role="rowgroup">
          <div class="cal-timeline__corner" aria-hidden="true" />
          <For each={rows()}>
            {(row) => (
              <div
                class="cal-timeline__res"
                style={{ height: `${rowHeight(row)}px` }}
                role="rowheader"
              >
                <Show
                  when={row.resource}
                  fallback={
                    <span class="cal-timeline__res-name">All events</span>
                  }
                >
                  {(resource) => (
                    <>
                      <span
                        class="cal-timeline__pip"
                        style={{
                          background: resource().color || "var(--cal-accent)",
                        }}
                        aria-hidden="true"
                      />
                      <span class="cal-timeline__res-name">
                        {resource().title}
                      </span>
                    </>
                  )}
                </Show>
              </div>
            )}
          </For>
        </div>

        {/* Scrollable axis + bars */}
        <div class="cal-timeline__scroll">
          <div class="cal-timeline__track">
            {/* Time axis header */}
            <div class="cal-timeline__axis">
              <For each={slots()}>
                {(slot, i) => (
                  <div
                    class="cal-timeline__tick"
                    classList={{ "cal-timeline__tick--now": slot.isNow }}
                    style={{
                      left: `${slot.left * 100}%`,
                      width: `${slotWidth(slots(), i()) * 100}%`,
                    }}
                  >
                    <span class="cal-timeline__tick-label">
                      {timelineTickLabel(slot.start, unit(), timeZone())}
                    </span>
                  </div>
                )}
              </For>
            </div>

            {/* Rows with vertical gridlines + bars */}
            <div class="cal-timeline__lanes" ref={axisRef}>
              {/* Vertical gridlines aligned to slots */}
              <div class="cal-timeline__lines" aria-hidden="true">
                <For each={slots()}>
                  {(slot) => (
                    <div
                      class="cal-timeline__vline"
                      style={{ left: `${slot.left * 100}%` }}
                    />
                  )}
                </For>
              </div>

              <Show when={nowFrac() !== null}>
                <div
                  class="cal-timeline__now"
                  style={{ left: `${nowFrac()! * 100}%` }}
                  aria-hidden="true"
                >
                  <span class="cal-timeline__now-dot" />
                </div>
              </Show>

              <div class="cal-timeline__rows" ref={rowsRef}>
                <For each={rows()}>
                  {(row, rowIndex) => (
                    <div
                      class="cal-timeline__row"
                      classList={{
                        "cal-timeline__row--drop": (() => {
                          const a = active();
                          return (
                            !!a &&
                            a.kind === "move" &&
                            a.toRow === rowIndex() &&
                            a.fromRow !== rowIndex()
                          );
                        })(),
                      }}
                      style={{ height: `${rowHeight(row)}px` }}
                      role="row"
                    >
                      <For each={row.bars}>
                        {(bar) => (
                          <Bar
                            bar={bar}
                            timeZone={timeZone()}
                            hidden={
                              active()?.instance.key === bar.instance.key &&
                              !!active()?.moved
                            }
                            onClick={() => callbacks.onEventClick?.(bar.instance)}
                            onPointerDown={(e, kind) =>
                              beginDrag(e, bar.instance, rowIndex(), kind)
                            }
                          />
                        )}
                      </For>
                    </div>
                  )}
                </For>

                {/* Live drag preview */}
                <Show when={active() && active()!.moved}>
                  <DragPreview
                    active={active()!}
                    rows={rows()}
                    range={range()}
                    span={span()}
                    timeZone={timeZone()}
                  />
                </Show>
              </div>
            </div>
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

/** Fractional width of slot `i` (distance to the next slot, or to the end). */
function slotWidth(slots: TimelineViewModel["slots"], i: number): number {
  const here = slots[i]!.left;
  const next = slots[i + 1]?.left ?? 1;
  return Math.max(next - here, 0);
}

interface BarProps {
  bar: TimelineBar;
  timeZone: string;
  hidden: boolean;
  onClick: () => void;
  onPointerDown: (e: PointerEvent, kind: DragKind) => void;
}

function Bar(props: BarProps): JSX.Element {
  const instance = (): EventInstance => props.bar.instance;
  const editable = (): boolean => instance().editable !== false;
  return (
    <div
      class="cal-event cal-timeline__bar"
      classList={{ "cal-event--locked": !editable() }}
      role="button"
      tabindex={0}
      aria-label={`${instance().title}, ${formatTime(instance().start, props.timeZone)}`}
      style={{
        left: `${props.bar.left * 100}%`,
        width: `${props.bar.width * 100}%`,
        top: `${props.bar.lane * LANE_HEIGHT + ROW_PAD / 2}px`,
        visibility: props.hidden ? "hidden" : undefined,
        "--cal-event-color": instance().color || undefined,
      }}
      onPointerDown={(e) => {
        if (!editable()) return;
        props.onPointerDown(e, "move");
      }}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClick();
        }
      }}
      title={instance().title}
    >
      <Show when={editable() && !props.bar.continuesBefore}>
        <span
          class="cal-timeline__handle cal-timeline__handle--start"
          onPointerDown={(e) => props.onPointerDown(e, "resize-start")}
        />
      </Show>
      <span class="cal-event__title">
        {props.bar.continuesBefore ? "‹ " : ""}
        {instance().title}
        {props.bar.continuesAfter ? " ›" : ""}
      </span>
      <Show when={editable() && !props.bar.continuesAfter}>
        <span
          class="cal-timeline__handle cal-timeline__handle--end"
          onPointerDown={(e) => props.onPointerDown(e, "resize-end")}
        />
      </Show>
    </div>
  );
}

function DragPreview(props: {
  active: ActiveDrag;
  rows: TimelineRowModel[];
  range: { start: number; end: number };
  span: number;
  timeZone: string;
}): JSX.Element {
  const left = (): number =>
    Math.max((props.active.start - props.range.start) / props.span, 0);
  const width = (): number =>
    Math.max((props.active.end - props.active.start) / props.span, 0);
  // Vertical offset: sum the heights of the rows above the (possibly new) target.
  const top = (): number => {
    let t = ROW_PAD / 2;
    const targetRow =
      props.active.kind === "move" ? props.active.toRow : props.active.fromRow;
    for (let i = 0; i < targetRow; i++) {
      t += rowHeight(props.rows[i]!);
    }
    return t;
  };
  return (
    <div
      class="cal-event cal-event--preview cal-timeline__bar"
      style={{
        left: `${left() * 100}%`,
        width: `${width() * 100}%`,
        top: `${top()}px`,
        "--cal-event-color": props.active.instance.color || undefined,
      }}
    >
      <span class="cal-event__time">
        {formatTime(props.active.start, props.timeZone)}
      </span>
    </div>
  );
}
