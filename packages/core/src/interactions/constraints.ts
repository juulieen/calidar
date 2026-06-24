/**
 * Pure interval-constraint helpers for drag/resize/create gestures and
 * scheduling logic: snap to a granularity, clamp duration, keep within bounds,
 * and detect / avoid overlaps. Compose with `DragSession` — apply
 * `constrainInterval` to its preview before committing.
 */

export interface Interval {
  start: number;
  end: number;
}

export interface IntervalConstraints {
  /** Snap start & end to this many minutes (0 / undefined disables). */
  snapMinutes?: number;
  /** Minimum duration (ms). */
  minDurationMs?: number;
  /** Maximum duration (ms). */
  maxDurationMs?: number;
  /** Hard lower bound for the start (epoch ms). */
  minStart?: number;
  /** Hard upper bound for the end (epoch ms). */
  maxEnd?: number;
}

function snap(epoch: number, snapMs: number): number {
  if (snapMs <= 0) return epoch;
  return Math.round(epoch / snapMs) * snapMs;
}

/**
 * Apply granularity, duration and bound constraints to an interval. Duration is
 * preserved when clamping to bounds where possible; `minDuration` wins over a
 * conflicting `maxEnd` only as far as the bounds allow.
 */
export function constrainInterval(
  interval: Interval,
  c: IntervalConstraints,
): Interval {
  let start = interval.start;
  let end = interval.end;
  const snapMs = (c.snapMinutes ?? 0) * 60_000;
  start = snap(start, snapMs);
  end = snap(end, snapMs);
  if (end < start) {
    const t = start;
    start = end;
    end = t;
  }

  let dur = end - start;
  if (c.minDurationMs != null && dur < c.minDurationMs) {
    dur = c.minDurationMs;
    end = start + dur;
  }
  if (c.maxDurationMs != null && dur > c.maxDurationMs) {
    dur = c.maxDurationMs;
    end = start + dur;
  }

  if (c.minStart != null && start < c.minStart) {
    start = c.minStart;
    end = start + dur;
  }
  if (c.maxEnd != null && end > c.maxEnd) {
    end = c.maxEnd;
    start = end - dur;
    if (c.minStart != null && start < c.minStart) start = c.minStart;
  }
  return { start, end };
}

/** True when two half-open intervals `[start, end)` overlap. */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export interface BusyInterval extends Interval {
  /** Optional key so a moving event can ignore itself. */
  key?: string;
}

/** Whether `interval` collides with any `busy` interval (ignoring `ignoreKey`). */
export function hasConflict(
  interval: Interval,
  busy: BusyInterval[],
  ignoreKey?: string,
): boolean {
  for (const b of busy) {
    if (ignoreKey != null && b.key === ignoreKey) continue;
    if (intervalsOverlap(interval, b)) return true;
  }
  return false;
}

/**
 * The first interval of length `durationMs` starting at or after `from` that
 * doesn't collide with any `busy` interval. Useful for "find next free slot".
 */
export function firstFreeSlot(
  from: number,
  durationMs: number,
  busy: BusyInterval[],
  ignoreKey?: string,
): Interval {
  const blocks = busy
    .filter((b) => ignoreKey == null || b.key !== ignoreKey)
    .sort((a, b) => a.start - b.start);
  let candidate = from;
  let moved = true;
  let guard = 0;
  while (moved && guard++ < 10_000) {
    moved = false;
    for (const b of blocks) {
      if (intervalsOverlap({ start: candidate, end: candidate + durationMs }, b)) {
        candidate = b.end;
        moved = true;
      }
    }
  }
  return { start: candidate, end: candidate + durationMs };
}
