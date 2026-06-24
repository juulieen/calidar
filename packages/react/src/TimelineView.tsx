/**
 * Timeline view: resources as rows, a HORIZONTAL time axis.
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
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
  return Math.max(Math.max(row.lanes, 1) * LANE_HEIGHT + ROW_PAD, MIN_ROW_HEIGHT);
}

function snap(epoch: number): number {
  return Math.round(epoch / SNAP_MS) * SNAP_MS;
}

export function TimelineView({ model, now }: Props): JSX.Element {
  const { store, onEventClick, onEventUpdate } = useCalendarContext();
  const { rows, slots, range, unit, timeZone } = model;
  const span = range.end - range.start;

  const edit = useCommitEdit();

  // Refs to the scrollable axis area and the stacked row track, used to map a
  // clientX → epoch instant and a clientY → row index during a drag.
  const axisRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);

  const [active, setActive] = useState<ActiveDrag | null>(null);
  const activeRef = useRef<ActiveDrag | null>(null);
  activeRef.current = active;

  // Map a clientX onto an epoch instant across the (possibly scrolled) axis.
  const instantAt = useCallback(
    (clientX: number): number => {
      const el = axisRef.current;
      if (!el) return range.start;
      const rect = el.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      const clamped = Math.min(Math.max(frac, 0), 1);
      return range.start + clamped * span;
    },
    [range.start, span],
  );

  // Map a clientY onto a row index (for cross-row resource reassignment).
  const rowAt = useCallback(
    (clientY: number): number => {
      const el = rowsRef.current;
      if (!el) return 0;
      const children = Array.from(el.children) as HTMLElement[];
      for (let i = 0; i < children.length; i++) {
        const r = children[i]!.getBoundingClientRect();
        if (clientY >= r.top && clientY < r.bottom) return i;
      }
      // Above the first / below the last → clamp.
      return clientY < el.getBoundingClientRect().top ? 0 : rows.length - 1;
    },
    [rows.length],
  );

  const beginDrag = useCallback(
    (
      e: React.PointerEvent,
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

      activeRef.current = {
        kind,
        instance,
        fromRow: rowIndex,
        toRow: rowIndex,
        start: origStart,
        end: origEnd,
        moved: false,
      };
      setActive(activeRef.current);

      const onMove = (ev: PointerEvent): void => {
        const prev = activeRef.current;
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
          const delta = snap(pointer - grabInstant);
          nextStart = origStart + delta;
          nextEnd = origEnd + delta;
          // Vertical travel reassigns the bar to another resource row.
          toRow = rowAt(ev.clientY);
        } else if (kind === "resize-start") {
          nextStart = Math.min(snap(pointer), origEnd - SNAP_MS);
          nextEnd = origEnd;
        } else {
          nextStart = origStart;
          nextEnd = Math.max(snap(pointer), origStart + SNAP_MS);
        }

        activeRef.current = {
          ...prev,
          start: nextStart,
          end: nextEnd,
          toRow,
          moved,
        };
        setActive(activeRef.current);
      };

      const onUp = (): void => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const final = activeRef.current;
        setActive(null);
        activeRef.current = null;
        if (!final || !final.moved) return;

        const patch: Partial<CalendarEvent> = {
          start: final.start,
          end: final.end,
        };
        // Cross-row drag (move only): reassign the resource.
        if (kind === "move" && final.toRow !== final.fromRow) {
          const target = rows[final.toRow]?.resource;
          if (target) patch.resourceId = target.id;
        }

        if (instance.recurring) {
          // Defer to the scope popover for the time change; apply the resource
          // change (if any) directly since the popover only carries start/end.
          if (patch.resourceId != null) {
            store.updateEvent(instance.eventId, { resourceId: patch.resourceId });
          }
          edit.commit(instance, { start: final.start, end: final.end });
          return;
        }
        store.updateEvent(instance.eventId, patch);
        onEventUpdate?.(instance.eventId, patch);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [edit, instantAt, onEventUpdate, rowAt, rows, store],
  );

  // Auto-scroll the day axis toward ~7am on first mount so business hours show.
  const didScroll = useRef(false);
  useLayoutEffect(() => {
    if (didScroll.current || unit !== "day") return;
    const el = axisRef.current?.parentElement;
    if (!el) return;
    didScroll.current = true;
    el.scrollLeft = Math.max(0, el.scrollWidth * (7 / 24) - 24);
  }, [unit]);

  // Keep a live "now" marker ticking each minute.
  const [tick, setTick] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const current = Math.max(now, tick);
  const nowFrac =
    current >= range.start && current < range.end
      ? (current - range.start) / span
      : null;

  return (
    <div className="cal-timeline">
      <div className="cal-timeline__grid">
        {/* Frozen resource column */}
        <div className="cal-timeline__resources" role="rowgroup">
          <div className="cal-timeline__corner" aria-hidden="true" />
          {rows.map((row) => (
            <div
              key={row.resource?.id ?? "all"}
              className="cal-timeline__res"
              style={{ height: `${rowHeight(row)}px` }}
              role="rowheader"
            >
              {row.resource ? (
                <>
                  <span
                    className="cal-timeline__pip"
                    style={{
                      background: row.resource.color || "var(--cal-accent)",
                    }}
                    aria-hidden="true"
                  />
                  <span className="cal-timeline__res-name">
                    {row.resource.title}
                  </span>
                </>
              ) : (
                <span className="cal-timeline__res-name">All events</span>
              )}
            </div>
          ))}
        </div>

        {/* Scrollable axis + bars */}
        <div className="cal-timeline__scroll">
          <div className="cal-timeline__track">
            {/* Time axis header */}
            <div className="cal-timeline__axis">
              {slots.map((slot, i) => (
                <div
                  key={slot.start}
                  className={`cal-timeline__tick${slot.isNow ? " cal-timeline__tick--now" : ""}`}
                  style={{
                    left: `${slot.left * 100}%`,
                    width: `${slotWidth(slots, i) * 100}%`,
                  }}
                >
                  <span className="cal-timeline__tick-label">
                    {timelineTickLabel(slot.start, unit, timeZone)}
                  </span>
                </div>
              ))}
            </div>

            {/* Rows with vertical gridlines + bars */}
            <div className="cal-timeline__lanes" ref={axisRef}>
              {/* Vertical gridlines aligned to slots */}
              <div className="cal-timeline__lines" aria-hidden="true">
                {slots.map((slot) => (
                  <div
                    key={slot.start}
                    className="cal-timeline__vline"
                    style={{ left: `${slot.left * 100}%` }}
                  />
                ))}
              </div>

              {nowFrac !== null && (
                <div
                  className="cal-timeline__now"
                  style={{ left: `${nowFrac * 100}%` }}
                  aria-hidden="true"
                >
                  <span className="cal-timeline__now-dot" />
                </div>
              )}

              <div className="cal-timeline__rows" ref={rowsRef}>
                {rows.map((row, rowIndex) => (
                  <div
                    key={row.resource?.id ?? "all"}
                    className={`cal-timeline__row${
                      active && active.kind === "move" && active.toRow === rowIndex && active.fromRow !== rowIndex
                        ? " cal-timeline__row--drop"
                        : ""
                    }`}
                    style={{ height: `${rowHeight(row)}px` }}
                    role="row"
                  >
                    {row.bars.map((bar) => (
                      <Bar
                        key={bar.instance.key}
                        bar={bar}
                        timeZone={timeZone}
                        hidden={
                          active?.instance.key === bar.instance.key &&
                          active.moved
                        }
                        onClick={() => onEventClick?.(bar.instance)}
                        onPointerDown={(e, kind) =>
                          beginDrag(e, bar.instance, rowIndex, kind)
                        }
                      />
                    ))}
                  </div>
                ))}

                {/* Live drag preview */}
                {active && active.moved && (
                  <DragPreview
                    active={active}
                    rows={rows}
                    range={range}
                    span={span}
                    timeZone={timeZone}
                  />
                )}
              </div>
            </div>
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

/** Fractional width of slot `i` (distance to the next slot, or to the end). */
function slotWidth(
  slots: TimelineViewModel["slots"],
  i: number,
): number {
  const here = slots[i]!.left;
  const next = slots[i + 1]?.left ?? 1;
  return Math.max(next - here, 0);
}

interface BarProps {
  bar: TimelineBar;
  timeZone: string;
  hidden: boolean;
  onClick: () => void;
  onPointerDown: (e: React.PointerEvent, kind: DragKind) => void;
}

function Bar({ bar, timeZone, hidden, onClick, onPointerDown }: BarProps): JSX.Element {
  const { instance } = bar;
  const editable = instance.editable !== false;
  return (
    <div
      className={`cal-event cal-timeline__bar${editable ? "" : " cal-event--locked"}`}
      role="button"
      tabIndex={0}
      aria-label={`${instance.title}, ${formatTime(instance.start, timeZone)}`}
      style={{
        left: `${bar.left * 100}%`,
        width: `${bar.width * 100}%`,
        top: `${bar.lane * LANE_HEIGHT + ROW_PAD / 2}px`,
        visibility: hidden ? "hidden" : undefined,
        ["--cal-event-color" as string]: instance.color || undefined,
      }}
      onPointerDown={(e) => {
        if (!editable) return;
        onPointerDown(e, "move");
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      title={instance.title}
    >
      {editable && !bar.continuesBefore && (
        <span
          className="cal-timeline__handle cal-timeline__handle--start"
          onPointerDown={(e) => onPointerDown(e, "resize-start")}
        />
      )}
      <span className="cal-event__title">
        {bar.continuesBefore ? "‹ " : ""}
        {instance.title}
        {bar.continuesAfter ? " ›" : ""}
      </span>
      {editable && !bar.continuesAfter && (
        <span
          className="cal-timeline__handle cal-timeline__handle--end"
          onPointerDown={(e) => onPointerDown(e, "resize-end")}
        />
      )}
    </div>
  );
}

function DragPreview({
  active,
  rows,
  range,
  span,
  timeZone,
}: {
  active: ActiveDrag;
  rows: TimelineRowModel[];
  range: { start: number; end: number };
  span: number;
  timeZone: string;
}): JSX.Element {
  const left = Math.max((active.start - range.start) / span, 0);
  const width = Math.max((active.end - active.start) / span, 0);
  // Vertical offset: sum the heights of the rows above the (possibly new) target.
  let top = ROW_PAD / 2;
  const targetRow = active.kind === "move" ? active.toRow : active.fromRow;
  for (let i = 0; i < targetRow; i++) {
    top += rowHeight(rows[i]!);
  }
  return (
    <div
      className="cal-event cal-event--preview cal-timeline__bar"
      style={{
        left: `${left * 100}%`,
        width: `${width * 100}%`,
        top: `${top}px`,
        ["--cal-event-color" as string]: active.instance.color || undefined,
      }}
    >
      <span className="cal-event__time">{formatTime(active.start, timeZone)}</span>
    </div>
  );
}
