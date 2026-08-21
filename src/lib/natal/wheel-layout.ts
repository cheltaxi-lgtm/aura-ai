/** Separate nearby longitudes so wheel glyphs stay readable. */

import { angularSeparation, mod360 } from "./math";

export type LaidWheelBody<T> = T & {
  lane: number;
  displayLongitude: number;
};

function circularMean(longitudes: readonly number[]): number {
  const x = longitudes.reduce((sum, lon) => sum + Math.cos((lon * Math.PI) / 180), 0);
  const y = longitudes.reduce((sum, lon) => sum + Math.sin((lon * Math.PI) / 180), 0);
  return mod360((Math.atan2(y, x) * 180) / Math.PI);
}

function separateDisplayLongitudes<T extends { displayLongitude: number }>(
  items: T[],
  minGapDeg: number,
): T[] {
  if (items.length < 2) return items;
  const sorted = [...items].sort((left, right) => left.displayLongitude - right.displayLongitude);

  for (let pass = 0; pass < 6; pass += 1) {
    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index];
      const next = sorted[(index + 1) % sorted.length];
      const gap = index === sorted.length - 1
        ? next.displayLongitude + 360 - current.displayLongitude
        : next.displayLongitude - current.displayLongitude;
      if (gap >= minGapDeg) continue;
      const nudge = (minGapDeg - gap) / 2;
      current.displayLongitude = mod360(current.displayLongitude - nudge);
      next.displayLongitude = mod360(next.displayLongitude + nudge);
    }
    sorted.sort((left, right) => left.displayLongitude - right.displayLongitude);
  }

  return sorted;
}

function clampDisplayToSign(trueLongitude: number, displayLongitude: number): number {
  const start = Math.floor(mod360(trueLongitude) / 30) * 30;
  const min = start + 2;
  const max = start + 28;
  let display = displayLongitude;
  while (display < start - 180) display += 360;
  while (display >= start + 180) display -= 360;
  return mod360(Math.min(max, Math.max(min, display)));
}

export function layoutWheelBodies<T extends { longitude: number }>(
  items: readonly T[],
  minGapDeg = 16,
  laneCount = 3,
  options?: { stayInSign?: boolean; radialOnly?: boolean },
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

  if (options?.radialOnly) {
    return groups.flatMap((group) => group.map((item, index) => ({
      ...item,
      lane: group.length === 1 ? 0 : index % laneCount,
      displayLongitude: item.longitude,
    })));
  }

  const laid = groups.flatMap((group) => {
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

  const separated = separateDisplayLongitudes(laid, minGapDeg);
  if (!options?.stayInSign) return separated;
  return separated.map((item) => ({
    ...item,
    displayLongitude: clampDisplayToSign(item.longitude, item.displayLongitude),
  }));
}

export function wheeledRadius(
  base: number,
  lane: number,
  step: number,
  direction: 1 | -1 = -1,
): number {
  return Math.max(base * 0.45, base + direction * lane * step);
}

export function minDisplayGap(items: ReadonlyArray<{ displayLongitude: number }>): number {
  if (items.length < 2) return 360;
  return items.reduce((smallest, item, index) => {
    const next = items[(index + 1) % items.length];
    return Math.min(smallest, angularSeparation(item.displayLongitude, next.displayLongitude));
  }, 360);
}
