/**
 * Lane packing for multi-day / all-day event bands across a row of day
 * columns. Used by the month grid and by the all-day strip of week/day views.
 *
 * Each band occupies a contiguous span of columns and is assigned the
 * top-most lane that is free across that whole span — the stacking behaviour
 * of Google Calendar's month cells.
 */
import type { DayBand, EventInstance } from "../types.js";

/**
 * @param instances  events to place (all-day or multi-day spanning the row)
 * @param boundaries epoch-ms column edges, length = nDays + 1; column `i`
 *                   covers `[boundaries[i], boundaries[i + 1])`
 */
export function layoutDayBands(
  instances: EventInstance[],
  boundaries: number[],
): DayBand[] {
  const nDays = boundaries.length - 1;
  if (nDays <= 0) return [];
  const rowStart = boundaries[0]!;
  const rowEnd = boundaries[nDays]!;

  const partial: Omit<DayBand, "lane">[] = [];
  for (const instance of instances) {
    if (instance.end <= rowStart || instance.start >= rowEnd) continue;
    let startCol = -1;
    let endCol = -1;
    for (let i = 0; i < nDays; i++) {
      const colStart = boundaries[i]!;
      const colEnd = boundaries[i + 1]!;
      if (instance.start < colEnd && instance.end > colStart) {
        if (startCol === -1) startCol = i;
        endCol = i;
      }
    }
    if (startCol === -1) continue;
    partial.push({
      instance,
      startCol,
      endCol,
      continuesBefore: instance.start < rowStart,
      continuesAfter: instance.end > rowEnd,
    });
  }

  // Longest spans first, then by start column, for tidy stacking.
  partial.sort(
    (a, b) =>
      a.startCol - b.startCol ||
      b.endCol - b.startCol - (a.endCol - a.startCol) ||
      a.instance.start - b.instance.start,
  );

  const laneLastCol: number[] = []; // laneLastCol[lane] = last occupied column
  const bands: DayBand[] = [];
  for (const band of partial) {
    let lane = 0;
    while (lane < laneLastCol.length && laneLastCol[lane]! >= band.startCol) {
      lane++;
    }
    laneLastCol[lane] = band.endCol;
    bands.push({ ...band, lane });
  }
  return bands;
}

/** The number of lanes a set of bands occupies (max lane + 1). */
export function laneCount(bands: DayBand[]): number {
  let max = -1;
  for (const b of bands) if (b.lane > max) max = b.lane;
  return max + 1;
}
