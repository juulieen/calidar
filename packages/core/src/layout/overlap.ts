/**
 * Column-packing layout for overlapping timed events within a single day
 * column — the same visual algorithm Google Calendar / Outlook use:
 *
 *  1. Group events into "collision clusters" (transitively overlapping).
 *  2. Greedily assign each event to the left-most free column.
 *  3. Widen each event rightwards into adjacent free columns so isolated
 *     events fill the available space instead of leaving gaps.
 */
import type { EventInstance, TimedLayout } from "../types.js";

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

interface Placed {
  instance: EventInstance;
  start: number;
  end: number;
  col: number;
}

/**
 * Lay out timed instances inside the window `[dayStart, dayEnd)` (epoch ms).
 * Instances are clipped to the window; zero-length results are dropped.
 */
export function layoutTimedColumns(
  instances: EventInstance[],
  dayStart: number,
  dayEnd: number,
  minDurationMs = 0,
): TimedLayout[] {
  const span = dayEnd - dayStart;
  if (span <= 0) return [];

  // Clip to the day window and sort by start asc, then longer first.
  const clipped = instances
    .map((instance) => ({
      instance,
      start: Math.max(instance.start, dayStart),
      end: Math.min(instance.end, dayEnd),
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const result: TimedLayout[] = [];

  // Walk through collision clusters.
  let cluster: Placed[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    // Greedy column assignment.
    const colEnds: number[] = [];
    for (const item of cluster) {
      let assigned = -1;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c]! <= item.start) {
          assigned = c;
          break;
        }
      }
      if (assigned === -1) {
        assigned = colEnds.length;
        colEnds.push(item.end);
      } else {
        colEnds[assigned] = item.end;
      }
      item.col = assigned;
    }
    const numCols = colEnds.length;
    // Width expansion: extend each event into free columns to its right.
    for (const item of cluster) {
      let colSpan = 1;
      for (let c = item.col + 1; c < numCols; c++) {
        const blocked = cluster.some(
          (other) =>
            other !== item &&
            other.col === c &&
            overlaps(item.start, item.end, other.start, other.end),
        );
        if (blocked) break;
        colSpan++;
      }
      const top = (item.start - dayStart) / span;
      const rawHeight = (item.end - item.start) / span;
      const minHeight = minDurationMs > 0 ? minDurationMs / span : 0;
      result.push({
        instance: item.instance,
        top,
        height: Math.max(rawHeight, minHeight),
        column: item.col,
        columns: numCols,
        left: item.col / numCols,
        width: colSpan / numCols,
      });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const c of clipped) {
    if (cluster.length > 0 && c.start >= clusterEnd) flush();
    cluster.push({ instance: c.instance, start: c.start, end: c.end, col: 0 });
    clusterEnd = Math.max(clusterEnd, c.end);
  }
  flush();

  return result;
}
