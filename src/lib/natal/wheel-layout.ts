/** Separate nearby longitudes so wheel glyphs stay readable. */

import { mod360 } from "./math";

export type LaidWheelBody<T> = T & {
  lane: number;
  displayLongitude: number;
};

function circularMean(longitudes: readonly number[]): number {
  const x = longitudes.reduce((sum, lon) => sum + Math.cos((lon * Math.PI) / 180), 0);
  const y = longitudes.reduce((sum, lon) => sum + Math.sin((lon * Math.PI) / 180), 0);
  return mod360((Math.atan2(y, x) * 180) / Math.PI);
}

export function layoutWheelBodies<T extends { longitude: number }>(
  items: readonly T[],
  minGapDeg = 16,
  laneCount = 3,
): Array<LaidWheelBody<T>> {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.longitude - b.longitude);
  const groups: T[][] = [];
  let current: T[] = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const gap = sorted[index].longitude - sorted[index - 1].longitude;
    if (gap <= minGapDeg) current.push(sorted[index]);
    else {
      groups.push(current);
      current = [sorted[index]];
    }
  }
  groups.push(current);

  if (groups.length > 1) {
    const wrap = sorted[0].longitude + 360 - sorted[sorted.length - 1].longitude;
    if (wrap <= minGapDeg) {
      const first = groups.shift();
      const last = groups.pop();
      if (first && last) groups.push([...last, ...first]);
    }
  }

  return groups.flatMap((group) => {
    if (group.length === 1) {
      return [{ ...group[0], lane: 0, displayLongitude: group[0].longitude }];
    }
    const mean = circularMean(group.map((item) => item.longitude));
    const start = mean - ((group.length - 1) * minGapDeg) / 2;
    return group.map((item, index) => ({
      ...item,
      lane: index % laneCount,
      displayLongitude: mod360(start + index * minGapDeg),
    }));
  });
}

export function wheeledRadius(base: number, lane: number, step: number): number {
  return Math.max(base * 0.55, base - lane * step);
}
