/**
 * Destiny Matrix v2 layout. Dates change arcana values, never coordinates.
 *
 * Regular octagon: 8 outer vertices + inner axis crosses + tail stack.
 * Age lives on a dedicated bezel outside the nodes.
 */

export const MATRIX_VIEWBOX = { width: 1000, height: 1120, minX: 36, minY: 28 } as const;

export const MATRIX_ORIGIN = { x: 500, y: 498 } as const;
/** ~1.36× previous radius; CSS frame is also wider → ~1.7× perceived size. */
export const MATRIX_RADIUS = 338;

export const AGE_BEZEL_GAP = 54;
export const AGE_NUMBER_GAP_MAJOR = 82;
export const AGE_NUMBER_GAP_MINOR = 74;
export const INNER_RATIO = 0.5;
export const PATERNAL_T = 0.34;
export const TAIL_GAP = 108;

export type MatrixLayoutId =
  | "outer.left"
  | "outer.topLeft"
  | "outer.top"
  | "outer.topRight"
  | "outer.right"
  | "outer.bottomRight"
  | "outer.bottom"
  | "outer.bottomLeft"
  | "center"
  | "vertical.top"
  | "vertical.bottom"
  | "horizontal.left"
  | "horizontal.right"
  | "maleLine.head"
  | "karmicTail.tip"
  | "period.year"
  | "period.month";

export type MatrixPoint2d = { x: number; y: number };

const DEG = Math.PI / 180;

/** Clockwise from LEFT so age 0 sits on the character vertex. */
export const OUTER_ANGLE_DEG = {
  "outer.left": 180,
  "outer.topLeft": 135,
  "outer.top": 90,
  "outer.topRight": 45,
  "outer.right": 0,
  "outer.bottomRight": -45,
  "outer.bottom": -90,
  "outer.bottomLeft": -135,
} as const;

export const OUTER_LAYOUT_IDS = [
  "outer.left",
  "outer.topLeft",
  "outer.top",
  "outer.topRight",
  "outer.right",
  "outer.bottomRight",
  "outer.bottom",
  "outer.bottomLeft",
] as const satisfies readonly MatrixLayoutId[];

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function polar(radius: number, angleDeg: number): MatrixPoint2d {
  const a = angleDeg * DEG;
  return {
    x: round2(MATRIX_ORIGIN.x + radius * Math.cos(a)),
    y: round2(MATRIX_ORIGIN.y - radius * Math.sin(a)),
  };
}

export function along(a: MatrixPoint2d, b: MatrixPoint2d, t: number): MatrixPoint2d {
  return {
    x: round2(a.x + (b.x - a.x) * t),
    y: round2(a.y + (b.y - a.y) * t),
  };
}

function lerpAngle(a0: number, a1: number, t: number): number {
  let delta = a1 - a0;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return a0 + delta * t;
}

const LEFT = polar(MATRIX_RADIUS, OUTER_ANGLE_DEG["outer.left"]);
const TOP = polar(MATRIX_RADIUS, OUTER_ANGLE_DEG["outer.top"]);
const RIGHT = polar(MATRIX_RADIUS, OUTER_ANGLE_DEG["outer.right"]);
const BOTTOM = polar(MATRIX_RADIUS, OUTER_ANGLE_DEG["outer.bottom"]);
const TOP_LEFT = polar(MATRIX_RADIUS, OUTER_ANGLE_DEG["outer.topLeft"]);
const TOP_RIGHT = polar(MATRIX_RADIUS, OUTER_ANGLE_DEG["outer.topRight"]);
const BOTTOM_RIGHT = polar(MATRIX_RADIUS, OUTER_ANGLE_DEG["outer.bottomRight"]);
const BOTTOM_LEFT = polar(MATRIX_RADIUS, OUTER_ANGLE_DEG["outer.bottomLeft"]);

const INNER_R = MATRIX_RADIUS * INNER_RATIO;
const PATERNAL = along(LEFT, BOTTOM_RIGHT, PATERNAL_T);

export const MATRIX_NODE_LAYOUT: Record<MatrixLayoutId, MatrixPoint2d> = {
  "outer.left": LEFT,
  "outer.topLeft": TOP_LEFT,
  "outer.top": TOP,
  "outer.topRight": TOP_RIGHT,
  "outer.right": RIGHT,
  "outer.bottomRight": BOTTOM_RIGHT,
  "outer.bottom": BOTTOM,
  "outer.bottomLeft": BOTTOM_LEFT,
  center: { x: MATRIX_ORIGIN.x, y: MATRIX_ORIGIN.y },
  "vertical.top": polar(INNER_R, 90),
  "vertical.bottom": polar(INNER_R, -90),
  "horizontal.left": polar(INNER_R, 180),
  "horizontal.right": polar(INNER_R, 0),
  "maleLine.head": PATERNAL,
  "karmicTail.tip": { x: MATRIX_ORIGIN.x, y: round2(BOTTOM.y + TAIL_GAP) },
  "period.year": { x: 312, y: 1064 },
  "period.month": { x: 688, y: 1064 },
};

export const MATRIX_NODE_RADIUS: Record<MatrixLayoutId, number> = {
  "outer.left": 34,
  "outer.topLeft": 28,
  "outer.top": 34,
  "outer.topRight": 28,
  "outer.right": 34,
  "outer.bottomRight": 28,
  "outer.bottom": 34,
  "outer.bottomLeft": 28,
  center: 52,
  "vertical.top": 26,
  "vertical.bottom": 26,
  "horizontal.left": 26,
  "horizontal.right": 26,
  "maleLine.head": 24,
  "karmicTail.tip": 26,
  "period.year": 0,
  "period.month": 0,
};

export const CENTER_HALO_RADIUS = 66;

export const PERSONAL_DIAMOND_IDS = [
  "outer.left",
  "outer.top",
  "outer.right",
  "outer.bottom",
] as const;

export const ANCESTRAL_SQUARE_IDS = [
  "outer.topLeft",
  "outer.topRight",
  "outer.bottomRight",
  "outer.bottomLeft",
] as const;

export type MatrixChannelLayoutId =
  | "skyEarth"
  | "love"
  | "money"
  | "male"
  | "female"
  | "karmicTail";

export const MATRIX_CHANNEL_PATHS: Record<MatrixChannelLayoutId, readonly MatrixLayoutId[]> = {
  skyEarth: ["outer.top", "vertical.top", "center", "vertical.bottom", "outer.bottom"],
  love: ["outer.left", "horizontal.left", "center"],
  money: ["center", "horizontal.right", "outer.right"],
  male: ["outer.left", "maleLine.head", "outer.bottomRight"],
  female: ["outer.topRight", "outer.bottomLeft"],
  karmicTail: ["vertical.bottom", "outer.bottom", "karmicTail.tip"],
};

export function ageSector(age: number): { index: number; t: number; angle: number } {
  const clamped = ((age % 80) + 80) % 80;
  const sector = clamped / 10;
  const index = Math.floor(sector) % 8;
  const t = sector - index;
  const a0 = OUTER_ANGLE_DEG[OUTER_LAYOUT_IDS[index]!];
  const a1 = OUTER_ANGLE_DEG[OUTER_LAYOUT_IDS[(index + 1) % 8]!];
  return { index, t, angle: lerpAngle(a0, a1, t) };
}

/** Tick sits on the age bezel. */
export function ageTickPosition(age: number): MatrixPoint2d {
  return polar(MATRIX_RADIUS + AGE_BEZEL_GAP, ageSector(age).angle);
}

/**
 * Age numerals sit on the bezel. Age 60 is shifted off the tail ray
 * so the karmic stack can hang straight down.
 */
export function ageMarkPosition(age: number): MatrixPoint2d {
  const { t, angle } = ageSector(age);
  const gap = t === 0 ? AGE_NUMBER_GAP_MAJOR : AGE_NUMBER_GAP_MINOR;
  const point = polar(MATRIX_RADIUS + gap, angle);
  if (age === 60) {
    return { x: round2(point.x - 38), y: round2(point.y + 6) };
  }
  return point;
}

export function ageBezelPoints(): MatrixPoint2d[] {
  return OUTER_LAYOUT_IDS.map((id) => polar(MATRIX_RADIUS + AGE_BEZEL_GAP, OUTER_ANGLE_DEG[id]));
}

export function layoutPoint(id: MatrixLayoutId): MatrixPoint2d {
  return MATRIX_NODE_LAYOUT[id];
}

export function polylineFor(ids: readonly MatrixLayoutId[]): string {
  return ids.map((id) => `${MATRIX_NODE_LAYOUT[id].x},${MATRIX_NODE_LAYOUT[id].y}`).join(" ");
}

export function polygonFor(ids: readonly MatrixLayoutId[]): string {
  return polylineFor(ids);
}
