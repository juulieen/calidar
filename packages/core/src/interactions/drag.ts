/**
 * Pointer-agnostic drag/resize/create gesture maths.
 *
 * Adapters convert pointer positions into an instant (epoch ms) and an
 * optional horizontal day-shift, then feed those to a `DragSession`. The
 * session returns a snapped `{ start, end }` preview — it knows nothing about
 * the DOM, pointers, or touch, so the same logic powers mouse, touch and pen.
 */

export type DragMode = "create" | "move" | "resize-start" | "resize-end";

export interface DragInit {
  mode: DragMode;
  /** Event's start at gesture begin (epoch ms). For "create", the anchor. */
  originStart: number;
  /** Event's end at gesture begin (epoch ms). For "create", the anchor. */
  originEnd: number;
  /** Pointer instant when the gesture began (epoch ms). */
  pointerStart: number;
  /** Snap granularity in minutes (default 15). Use 0 to disable. */
  snapMinutes?: number;
  /** Minimum event length while resizing/creating (default 15 min). */
  minDurationMs?: number;
}

export interface DragPreview {
  start: number;
  end: number;
  mode: DragMode;
}

const MIN_DEFAULT = 15 * 60_000;

function snap(epoch: number, snapMs: number): number {
  if (snapMs <= 0) return epoch;
  return Math.round(epoch / snapMs) * snapMs;
}

export class DragSession {
  private readonly init: Required<DragInit>;
  preview: DragPreview;

  constructor(init: DragInit) {
    this.init = {
      snapMinutes: 15,
      minDurationMs: MIN_DEFAULT,
      ...init,
    };
    this.preview = { start: init.originStart, end: init.originEnd, mode: init.mode };
  }

  /**
   * Recompute the preview for the current pointer instant.
   * @param pointerNow current pointer instant (epoch ms)
   * @param dayShiftMs horizontal shift in whole-day milliseconds (week views)
   */
  update(pointerNow: number, dayShiftMs = 0): DragPreview {
    const snapMs = this.init.snapMinutes * 60_000;
    const minDur = this.init.minDurationMs;
    const delta = pointerNow - this.init.pointerStart + dayShiftMs;
    const { originStart, originEnd, mode } = this.init;

    let start = originStart;
    let end = originEnd;

    switch (mode) {
      case "move": {
        start = snap(originStart + delta, snapMs);
        end = start + (originEnd - originStart);
        break;
      }
      case "resize-end": {
        end = snap(originEnd + delta, snapMs);
        if (end < originStart + minDur) end = originStart + minDur;
        start = originStart;
        break;
      }
      case "resize-start": {
        start = snap(originStart + delta, snapMs);
        if (start > originEnd - minDur) start = originEnd - minDur;
        end = originEnd;
        break;
      }
      case "create": {
        const anchor = originStart;
        const current = snap(pointerNow + dayShiftMs, snapMs);
        start = Math.min(anchor, current);
        end = Math.max(anchor, current);
        if (end - start < minDur) end = start + minDur;
        break;
      }
    }

    this.preview = { start, end, mode };
    return this.preview;
  }
}

/** One-shot helper: compute a preview without holding a session. */
export function applyDrag(init: DragInit, pointerNow: number, dayShiftMs = 0): DragPreview {
  return new DragSession(init).update(pointerNow, dayShiftMs);
}
