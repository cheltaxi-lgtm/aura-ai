import { GATE_ORDER } from "@/lib/human-design";
import {
  GATE_WHEEL_OFFSET,
  GATE_SIZE_DEG,
  LINE_SIZE_DEG,
} from "@/lib/human-design/constants";
import type { HdActivation, HdPublicActivation } from "@/lib/human-design";

/**
 * Rave Mandala ring geometry around the bodygraph.
 *
 * Chart content spans x 52..348, y 24..632 (see bodygraph-geometry.ts), so the
 * wheel is centered at (200, 328); the farthest chart point is a root corner
 * at ~306 units — the ring starts just outside it.
 *
 * Wheel orientation follows the astrological convention: 0° Aries at the left
 * horizon, longitudes grow counterclockwise. Gate order/offset come from the
 * canonical tables in src/lib/human-design/constants.ts (GATE_ORDER starts at
 * Gate 25 = 358°15').
 */

export const MANDALA_CX = 200;
export const MANDALA_CY = 328;
export const MANDALA_R_INNER = 312;
export const MANDALA_R_OUTER = 336;
export const MANDALA_R_GATE_NUM = 324;
export const MANDALA_R_SIGN = 349;
export const MANDALA_R_DESIGN = 362;
export const MANDALA_R_PERSONALITY = 374;

/** Tight chart-only frame and the wide frame that includes the ring. */
export const VIEWBOX_CHART = "0 0 400 700";
export const VIEWBOX_MANDALA = "-184 -56 768 768";

export interface WheelPoint {
  x: number;
  y: number;
}

/** Ecliptic longitude (degrees, any sign) → point on the wheel at radius r. */
export function wheelPoint(longitude: number, r: number): WheelPoint {
  const rad = ((180 - longitude) * Math.PI) / 180;
  return {
    x: MANDALA_CX + r * Math.cos(rad),
    y: MANDALA_CY - r * Math.sin(rad),
  };
}

export interface GateWheelSegment {
  gate: number;
  /** Absolute start longitude (may exceed 360 — trig handles it). */
  start: number;
  mid: number;
}

/** All 64 gates in wheel order with their ecliptic start longitudes. */
export const GATE_WHEEL: readonly GateWheelSegment[] = GATE_ORDER.map(
  (gate, i) => ({
    gate,
    start: GATE_WHEEL_OFFSET + i * GATE_SIZE_DEG,
    mid: GATE_WHEEL_OFFSET + (i + 0.5) * GATE_SIZE_DEG,
  })
);

export interface ZodiacSign {
  glyph: string;
  nameRu: string;
  /** Start longitude: Aries 0°, Taurus 30°, … */
  start: number;
  mid: number;
}

export const ZODIAC_SIGNS: readonly ZodiacSign[] = [
  ["♈", "Овен"], ["♉", "Телец"], ["♊", "Близнецы"], ["♋", "Рак"],
  ["♌", "Лев"], ["♍", "Дева"], ["♎", "Весы"], ["♏", "Скорпион"],
  ["♐", "Стрелец"], ["♑", "Козерог"], ["♒", "Водолей"], ["♓", "Рыбы"],
].map(([glyph, nameRu], i) => ({
  glyph: glyph as string,
  nameRu: nameRu as string,
  start: i * 30,
  mid: i * 30 + 15,
}));

/**
 * Ring band sector between two longitudes (annulus segment). Angles follow
 * the wheel orientation (counterclockwise with growing longitude).
 */
export function ringSectorPath(
  startL: number,
  endL: number,
  rIn: number,
  rOut: number
): string {
  const p1 = wheelPoint(startL, rOut);
  const p2 = wheelPoint(endL, rOut);
  const p3 = wheelPoint(endL, rIn);
  const p4 = wheelPoint(startL, rIn);
  // Wheel grows counterclockwise in math space; with SVG's y-down that is the
  // sweep-flag-1 direction for the outer arc and 0 for the inner return.
  return [
    `M${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A${rOut} ${rOut} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A${rIn} ${rIn} 0 0 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

/** Radial tick at a longitude between r1 and r2. */
export function wheelTick(
  longitude: number,
  r1: number,
  r2: number
): { x1: number; y1: number; x2: number; y2: number } {
  const a = wheelPoint(longitude, r1);
  const b = wheelPoint(longitude, r2);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/**
 * Exact ecliptic longitude of an activation. Full charts carry the raw
 * longitude; public share payloads strip it (birth PII), so we approximate
 * from gate + line — visually identical at ring scale (±0.47°).
 */
export function activationLongitude(
  a: HdActivation | HdPublicActivation
): number {
  if ("longitude" in a && typeof a.longitude === "number") return a.longitude;
  const idx = GATE_ORDER.indexOf(a.gate);
  if (idx < 0) return 0;
  return GATE_WHEEL_OFFSET + idx * GATE_SIZE_DEG + (a.line - 0.5) * LINE_SIZE_DEG;
}
