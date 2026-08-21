/** Separate nearby longitudes so wheel glyphs stay readable. */

import { angularSeparation, mod360 } from "./math";
import { chartPolar } from "./chart-angle";

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
      lane: group.length === 1 ? 0 : index,
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

/** Alternate inward/outward natal lanes without changing true longitude. */
export function natalLaneRadius(
  base: number,
  lane: number,
  step: number,
  minR: number,
  maxR: number,
): number {
  if (lane <= 0) return Math.min(maxR, Math.max(minR, base));
  const ring = Math.ceil(lane / 2);
  const signed = (lane % 2 === 1 ? -1 : 1) * ring * step;
  return Math.min(maxR, Math.max(minR, base + signed));
}

export type NatalGlyphLayout<T> = T & {
  lane: number;
  displayLongitude: number;
  radius: number;
};

function clusterByLongitude<T extends { longitude: number }>(
  items: readonly T[],
  minGapDeg: number,
): T[][] {
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
  return groups;
}

function evenRadii(count: number, base: number, step: number, minR: number, maxR: number): number[] {
  if (count <= 1) return [Math.min(maxR, Math.max(minR, base))];
  return Array.from({ length: count }, (_, index) => {
    const radius = base + (index - (count - 1) / 2) * step;
    return Math.min(maxR, Math.max(minR, radius));
  });
}

function clampDisplay(trueLongitude: number, displayLongitude: number, maxNudge: number): number {
  let delta = displayLongitude - trueLongitude;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return mod360(trueLongitude + Math.max(-maxNudge, Math.min(maxNudge, delta)));
}

function staggerRadii(radii: number[]): number[] {
  const assigned = Array.from({ length: radii.length }, () => radii[0]);
  let inner = 0;
  let outer = radii.length - 1;
  for (let index = 0; index < radii.length; index += 1) {
    assigned[index] = index % 2 === 0 ? radii[inner++] : radii[outer--];
  }
  return assigned;
}

function fanDisplayLongitudes(trueLongitudes: number[], minGapDeg: number, maxNudge: number): number[] {
  const display = [...trueLongitudes];
  if (display.length < 2) return display;
  const order = trueLongitudes.map((_, index) => index).sort((a, b) => trueLongitudes[a] - trueLongitudes[b]);
  const wrapGap = trueLongitudes[order[0]] + 360 - trueLongitudes[order[order.length - 1]];
  const wrap = wrapGap <= 180;
  for (let pass = 0; pass < 8; pass += 1) {
    const last = wrap ? order.length : order.length - 1;
    for (let cursor = 0; cursor < last; cursor += 1) {
      const current = order[cursor];
      const next = order[(cursor + 1) % order.length];
      const gap = cursor === order.length - 1
        ? display[next] + 360 - display[current]
        : display[next] - display[current];
      if (gap >= minGapDeg) continue;
      const nudge = (minGapDeg - gap) / 2;
      display[current] = mod360(display[current] - nudge);
      display[next] = mod360(display[next] + nudge);
    }
  }
  return display.map((value, index) => clampDisplay(trueLongitudes[index], value, maxNudge));
}

function natalScreenGapDeg(baseR: number, glyphR: number): number {
  return Math.max(18, ((glyphR * 2.8) / Math.max(baseR, 1)) * (180 / Math.PI));
}

/** Place natal glyphs so they do not overlap on screen. True longitude is unchanged. */
export function layoutNatalGlyphs<T extends { longitude: number }>(
  items: readonly T[],
  opts: {
    cx: number;
    cy: number;
    origin: number;
    baseR: number;
    minR: number;
    maxR: number;
    glyphR: number;
  },
): Array<NatalGlyphLayout<T>> {
  if (items.length === 0) return [];
  const maxNudge = 22;
  const minDist = opts.glyphR * 2.8;
  const step = opts.glyphR * 2.2;
  const clusterGap = natalScreenGapDeg(opts.baseR, opts.glyphR);
  const fanGap = (minDist / Math.max(opts.baseR, 1)) * (180 / Math.PI);
  const laid = clusterByLongitude(items, clusterGap).flatMap((group) => {
    const ringCount = Math.min(Math.max(group.length, 1), 3);
    const rings = staggerRadii(evenRadii(ringCount, opts.baseR, step, opts.minR, opts.maxR));
    const display = fanDisplayLongitudes(group.map((item) => item.longitude), fanGap, maxNudge);
    return group.map((item, index) => ({
      ...item,
      lane: index,
      displayLongitude: display[index],
      radius: rings[index % ringCount],
    }));
  });

  for (let pass = 0; pass < 12; pass += 1) {
    let moved = false;
    for (let i = 0; i < laid.length; i += 1) {
      for (let j = i + 1; j < laid.length; j += 1) {
        const left = chartPolar(opts.cx, opts.cy, laid[i].radius, laid[i].displayLongitude, opts.origin);
        const right = chartPolar(opts.cx, opts.cy, laid[j].radius, laid[j].displayLongitude, opts.origin);
        const dist = Math.hypot(right.x - left.x, right.y - left.y) || 0.01;
        if (dist >= minDist) continue;
        moved = true;
        const push = (minDist - dist) / 2;
        const dir = laid[j].radius >= laid[i].radius ? 1 : -1;
        laid[j].radius = Math.min(opts.maxR, Math.max(opts.minR, laid[j].radius + dir * push));
        laid[i].radius = Math.min(opts.maxR, Math.max(opts.minR, laid[i].radius - dir * push));
        const again = chartPolar(opts.cx, opts.cy, laid[j].radius, laid[j].displayLongitude, opts.origin);
        const still = chartPolar(opts.cx, opts.cy, laid[i].radius, laid[i].displayLongitude, opts.origin);
        if (Math.hypot(again.x - still.x, again.y - still.y) < minDist) {
          laid[j].displayLongitude = clampDisplay(laid[j].longitude, laid[j].displayLongitude + 2.5, maxNudge);
          laid[i].displayLongitude = clampDisplay(laid[i].longitude, laid[i].displayLongitude - 2.5, maxNudge);
        }
      }
    }
    if (!moved) break;
  }
  return laid;
}

export function minDisplayGap(items: ReadonlyArray<{ displayLongitude: number }>): number {
  if (items.length < 2) return 360;
  return items.reduce((smallest, item, index) => {
    const next = items[(index + 1) % items.length];
    return Math.min(smallest, angularSeparation(item.displayLongitude, next.displayLongitude));
  }, 360);
}
