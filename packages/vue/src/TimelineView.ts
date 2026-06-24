/**
 * Timeline view (Vue port): resources as rows, a HORIZONTAL time axis.
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
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  type PropType,
  type VNode,
} from "vue";
import type {
  CalendarEvent,
  EventInstance,
  TimelineBar,
  TimelineRowModel,
  TimelineViewModel,
  TimelineSlot,
} from "@calidar/core";
import { useCalendarContext } from "./context.js";
import { useCommitEdit } from "./useCommitEdit.js";
import { RecurrenceScopePopover } from "./RecurrenceScopePopover.js";
import { timelineTickLabel, type Formatters } from "./format.js";

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

type FormatTime = Formatters["formatTime"];

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

/** Fractional width of slot `i` (distance to the next slot, or to the end). */
function slotWidth(slots: TimelineSlot[], i: number): number {
  const here = slots[i]!.left;
  const next = slots[i + 1]?.left ?? 1;
  return Math.max(next - here, 0);
}

export const TimelineView = defineComponent({
  name: "TimelineView",
  props: {
    model: { type: Object as PropType<TimelineViewModel>, required: true },
    now: { type: Number, required: true },
  },
  setup(props) {
    const { store, onEventClick, onEventUpdate, formatters } =
      useCalendarContext();

    const edit = useCommitEdit();

    // Refs to the scrollable axis area and the stacked row track, used to map a
    // clientX → epoch instant and a clientY → row index during a drag.
    const axisRef = ref<HTMLDivElement | null>(null);
    const rowsRef = ref<HTMLDivElement | null>(null);

    const active = shallowRef<ActiveDrag | null>(null);
    let activeUp: (() => void) | null = null;

    // Keep a live "now" marker ticking each minute.
    const nowTick = ref(props.now);
    let nowTimer: ReturnType<typeof setInterval> | null = null;
    const didScroll = ref(false);

    onMounted(() => {
      nowTimer = setInterval(() => {
        nowTick.value = Date.now();
      }, 60_000);

      // Auto-scroll the day axis toward ~7am on first mount so business hours
      // show. axisRef = .cal-timeline__lanes → .parentElement =
      // .cal-timeline__track (no overflow) → .parentElement =
      // .cal-timeline__scroll (the actual scrollable).
      if (!didScroll.value && props.model.unit === "day") {
        const el = axisRef.value?.parentElement?.parentElement;
        if (el) {
          didScroll.value = true;
          el.scrollLeft = Math.max(0, el.scrollWidth * (7 / 24) - 24);
        }
      }
    });

    onUnmounted(() => {
      if (nowTimer) clearInterval(nowTimer);
      if (activeUp) {
        activeUp();
        activeUp = null;
      }
    });

    const span = (): number => props.model.range.end - props.model.range.start;

    // Map a clientX onto an epoch instant across the (possibly scrolled) axis.
    const instantAt = (clientX: number): number => {
      const el = axisRef.value;
      const range = props.model.range;
      if (!el) return range.start;
      const rect = el.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      const clamped = Math.min(Math.max(frac, 0), 1);
      return range.start + clamped * span();
    };

    // Map a clientY onto a row index (for cross-row resource reassignment).
    // Exclude the preview (which has no role="row") so its rect doesn't trick
    // the hit-test into returning a row index beyond the real row list.
    const rowAt = (clientY: number): number => {
      const el = rowsRef.value;
      const rows = props.model.rows;
      if (!el) return 0;
      const children = Array.from(el.children).filter(
        (c) => (c as HTMLElement).getAttribute("role") === "row",
      ) as HTMLElement[];
      for (let i = 0; i < children.length; i++) {
        const r = children[i]!.getBoundingClientRect();
        if (clientY >= r.top && clientY < r.bottom) return i;
      }
      return clientY < el.getBoundingClientRect().top ? 0 : rows.length - 1;
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

      active.value = {
        kind,
        instance,
        fromRow: rowIndex,
        toRow: rowIndex,
        start: origStart,
        end: origEnd,
        moved: false,
      };

      const onMove = (ev: PointerEvent): void => {
        const prev = active.value;
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
          // grid-aligned regardless of where inside a snap bucket the grab
          // started.
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

        active.value = {
          ...prev,
          start: nextStart,
          end: nextEnd,
          toRow,
          moved,
        };
      };

      const cleanup = (): void => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        activeUp = null;
      };

      const onUp = (): void => {
        const final = active.value;
        cleanup();
        active.value = null;
        if (!final || !final.moved) return;

        const patch: Partial<CalendarEvent> = {
          start: final.start,
          end: final.end,
        };
        // Cross-row drag (move only): reassign the resource.
        if (kind === "move" && final.toRow !== final.fromRow) {
          const target = props.model.rows[final.toRow]?.resource;
          if (target) patch.resourceId = target.id;
        }

        if (instance.recurring) {
          // Defer to the scope popover for the time change; also pass the
          // resourceId through the edit flow so the host is always notified.
          edit.commit(instance, {
            start: final.start,
            end: final.end,
            ...(patch.resourceId != null
              ? { resourceId: patch.resourceId }
              : {}),
          });
          return;
        }
        store.updateEvent(instance.eventId, patch);
        onEventUpdate?.(instance.eventId, patch);
      };

      // pointercancel fires on touch-scroll interception or OS gestures.
      // Cancel the drag without committing any changes.
      const onCancel = (): void => {
        cleanup();
        active.value = null;
      };

      activeUp = cleanup;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    };

    return () => {
      const model = props.model;
      const { rows, slots, range, unit, timeZone } = model;
      const sp = range.end - range.start;
      const { formatTime } = formatters.value;

      const current = Math.max(props.now, nowTick.value);
      const nowFrac =
        current >= range.start && current < range.end
          ? (current - range.start) / sp
          : null;

      const drag = active.value;

      const children: VNode[] = [
        h("div", { class: "cal-timeline__grid" }, [
          // Frozen resource column
          h("div", { class: "cal-timeline__resources", role: "rowgroup" }, [
            h("div", {
              class: "cal-timeline__corner",
              "aria-hidden": "true",
            }),
            ...rows.map((row) =>
              h(
                "div",
                {
                  key: row.resource?.id ?? "all",
                  class: "cal-timeline__res",
                  style: { height: `${rowHeight(row)}px` },
                  role: "rowheader",
                },
                row.resource
                  ? [
                      h("span", {
                        class: "cal-timeline__pip",
                        style: {
                          background:
                            row.resource.color || "var(--cal-accent)",
                        },
                        "aria-hidden": "true",
                      }),
                      h(
                        "span",
                        { class: "cal-timeline__res-name" },
                        row.resource.title,
                      ),
                    ]
                  : [
                      h(
                        "span",
                        { class: "cal-timeline__res-name" },
                        "All events",
                      ),
                    ],
              ),
            ),
          ]),

          // Scrollable axis + bars
          h("div", { class: "cal-timeline__scroll" }, [
            h("div", { class: "cal-timeline__track" }, [
              // Time axis header
              h(
                "div",
                { class: "cal-timeline__axis" },
                slots.map((slot, i) =>
                  h(
                    "div",
                    {
                      key: slot.start,
                      class: `cal-timeline__tick${
                        slot.isNow ? " cal-timeline__tick--now" : ""
                      }`,
                      style: {
                        left: `${slot.left * 100}%`,
                        width: `${slotWidth(slots, i) * 100}%`,
                      },
                    },
                    [
                      h(
                        "span",
                        { class: "cal-timeline__tick-label" },
                        timelineTickLabel(slot.start, unit, timeZone),
                      ),
                    ],
                  ),
                ),
              ),

              // Rows with vertical gridlines + bars
              h("div", { class: "cal-timeline__lanes", ref: axisRef }, [
                // Vertical gridlines aligned to slots
                h(
                  "div",
                  { class: "cal-timeline__lines", "aria-hidden": "true" },
                  slots.map((slot) =>
                    h("div", {
                      key: slot.start,
                      class: "cal-timeline__vline",
                      style: { left: `${slot.left * 100}%` },
                    }),
                  ),
                ),

                nowFrac !== null
                  ? h(
                      "div",
                      {
                        class: "cal-timeline__now",
                        style: { left: `${nowFrac * 100}%` },
                        "aria-hidden": "true",
                      },
                      [h("span", { class: "cal-timeline__now-dot" })],
                    )
                  : null,

                h(
                  "div",
                  { class: "cal-timeline__rows", ref: rowsRef },
                  [
                    ...rows.map((row, rowIndex) =>
                      h(
                        "div",
                        {
                          key: row.resource?.id ?? "all",
                          class: `cal-timeline__row${
                            drag &&
                            drag.kind === "move" &&
                            drag.toRow === rowIndex &&
                            drag.fromRow !== rowIndex
                              ? " cal-timeline__row--drop"
                              : ""
                          }`,
                          style: { height: `${rowHeight(row)}px` },
                          role: "row",
                        },
                        row.bars.map((bar) =>
                          renderBar(
                            bar,
                            timeZone,
                            drag?.instance.key === bar.instance.key &&
                              drag.moved,
                            onEventClick,
                            (e, kind) =>
                              beginDrag(e, bar.instance, rowIndex, kind),
                            formatTime,
                          ),
                        ),
                      ),
                    ),
                    // Live drag preview
                    drag && drag.moved
                      ? renderDragPreview(
                          drag,
                          rows,
                          range,
                          sp,
                          timeZone,
                          formatTime,
                        )
                      : null,
                  ],
                ),
              ]),
            ]),
          ]),
        ]),
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

      return h("div", { class: "cal-timeline" }, children);
    };
  },
});

function renderBar(
  bar: TimelineBar,
  timeZone: string,
  hidden: boolean,
  onEventClick: ((instance: EventInstance) => void) | undefined,
  onPointerDown: (e: PointerEvent, kind: DragKind) => void,
  formatTime: FormatTime,
): VNode {
  const { instance } = bar;
  const editable = instance.editable !== false;
  return h(
    "div",
    {
      key: instance.key,
      class: `cal-event cal-timeline__bar${editable ? "" : " cal-event--locked"}`,
      role: "button",
      tabindex: 0,
      "aria-label": `${instance.title}, ${formatTime(instance.start, timeZone)}`,
      style: {
        left: `${bar.left * 100}%`,
        width: `${bar.width * 100}%`,
        top: `${bar.lane * LANE_HEIGHT + ROW_PAD / 2}px`,
        visibility: hidden ? "hidden" : undefined,
        "--cal-event-color": instance.color || undefined,
      },
      onPointerdown: (e: PointerEvent) => {
        if (!editable) return;
        onPointerDown(e, "move");
      },
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
    [
      editable && !bar.continuesBefore
        ? h("span", {
            class: "cal-timeline__handle cal-timeline__handle--start",
            onPointerdown: (e: PointerEvent) =>
              onPointerDown(e, "resize-start"),
          })
        : null,
      h("span", { class: "cal-event__title" }, [
        bar.continuesBefore ? "‹ " : "",
        instance.title,
        bar.continuesAfter ? " ›" : "",
      ]),
      editable && !bar.continuesAfter
        ? h("span", {
            class: "cal-timeline__handle cal-timeline__handle--end",
            onPointerdown: (e: PointerEvent) => onPointerDown(e, "resize-end"),
          })
        : null,
    ],
  );
}

function renderDragPreview(
  active: ActiveDrag,
  rows: TimelineRowModel[],
  range: { start: number; end: number },
  span: number,
  timeZone: string,
  formatTime: FormatTime,
): VNode {
  const left = Math.max((active.start - range.start) / span, 0);
  const width = Math.max((active.end - active.start) / span, 0);
  // Vertical offset: sum the heights of the rows above the (possibly new)
  // target.
  let top = ROW_PAD / 2;
  const targetRow = active.kind === "move" ? active.toRow : active.fromRow;
  for (let i = 0; i < targetRow; i++) {
    top += rowHeight(rows[i]!);
  }
  return h(
    "div",
    {
      class: "cal-event cal-event--preview cal-timeline__bar",
      style: {
        left: `${left * 100}%`,
        width: `${width * 100}%`,
        top: `${top}px`,
        "--cal-event-color": active.instance.color || undefined,
      },
    },
    [
      h(
        "span",
        { class: "cal-event__time" },
        formatTime(active.start, timeZone),
      ),
    ],
  );
}
