/**
 * Destiny Matrix layout — filled octagram + circular age bezel.
 * Dates change arcana values, never coordinates.
 */

export const MATRIX_VIEWBOX = {
  minX: 0,
  minY: 0,
  width: 1000,
  height: 1064,
} as const;

export const MATRIX_ORIGIN = { x: 500, y: 478 } as const;
export const MATRIX_RADIUS = 376;

export const AGE_RING_GAP = 72;
export const AGE_BEAD_RADIUS = 17;
export const INNER_RATIO = 0.5;
export const PATERNAL_T = 0.34;
export const TAIL_GAP = 96;
export const GEN_RIBBON_GAP = 22;

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

export const INNER_RADIUS = MATRIX_RADIUS * INNER_RATIO;
export const GENERATION_RIBBON_RADIUS = MATRIX_RADIUS + GEN_RIBBON_GAP;

function lerp2(a: MatrixPoint2d, b: MatrixPoint2d, t: number): MatrixPoint2d {
  return {
    x: round2(a.x + (b.x - a.x) * t),
    y: round2(a.y + (b.y - a.y) * t),
  };
}

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
  "vertical.top": polar(INNER_RADIUS, 90),
  "vertical.bottom": polar(INNER_RADIUS, -90),
  "horizontal.left": polar(INNER_RADIUS, 180),
  "horizontal.right": polar(INNER_RADIUS, 0),
  "maleLine.head": lerp2(LEFT, BOTTOM_RIGHT, PATERNAL_T),
  "karmicTail.tip": { x: MATRIX_ORIGIN.x, y: round2(BOTTOM.y + TAIL_GAP) },
  "period.year": { x: 280, y: 1028 },
  "period.month": { x: 720, y: 1028 },
};

export const MATRIX_NODE_RADIUS: Record<MatrixLayoutId, number> = {
  "outer.left": 40,
  "outer.topLeft": 32,
  "outer.top": 40,
  "outer.topRight": 32,
  "outer.right": 40,
  "outer.bottomRight": 32,
  "outer.bottom": 40,
  "outer.bottomLeft": 32,
  center: 64,
  "vertical.top": 26,
  "vertical.bottom": 26,
  "horizontal.left": 26,
  "horizontal.right": 26,
  "maleLine.head": 24,
  "karmicTail.tip": 28,
  "period.year": 0,
  "period.month": 0,
};

export const CENTER_HALO_RADIUS = 68;
export const CENTER_CORE_RADIUS = 50;

function intersectVertical(a: MatrixPoint2d, b: MatrixPoint2d, x: number): MatrixPoint2d {
  const t = (x - a.x) / (b.x - a.x);
  return { x: round2(x), y: round2(a.y + (b.y - a.y) * t) };
}

function intersectHorizontal(a: MatrixPoint2d, b: MatrixPoint2d, y: number): MatrixPoint2d {
  const t = (y - a.y) / (b.y - a.y);
  return { x: round2(a.x + (b.x - a.x) * t), y: round2(y) };
}

/**
 * 16-vertex Star-of-Lakshmi outline (union of personal diamond + ancestral square).
 * Order is clockwise from the west point.
 */
export const STAR_OUTLINE: readonly MatrixPoint2d[] = [
  LEFT,
  intersectVertical(LEFT, TOP, TOP_LEFT.x),
  TOP_LEFT,
  intersectHorizontal(LEFT, TOP, TOP_LEFT.y),
  TOP,
  intersectHorizontal(TOP, RIGHT, TOP_RIGHT.y),
  TOP_RIGHT,
  intersectVertical(TOP, RIGHT, TOP_RIGHT.x),
  RIGHT,
  intersectVertical(RIGHT, BOTTOM, BOTTOM_RIGHT.x),
  BOTTOM_RIGHT,
  intersectHorizontal(RIGHT, BOTTOM, BOTTOM_RIGHT.y),
  BOTTOM,
  intersectHorizontal(BOTTOM, LEFT, BOTTOM_LEFT.y),
  BOTTOM_LEFT,
  intersectVertical(BOTTOM, LEFT, BOTTOM_LEFT.x),
];

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

/** v4 paths follow MATRIX_CHANNEL_DEFINITIONS. v3 replay keeps maleLine.head. */
export const MATRIX_CHANNEL_PATHS: Record<MatrixChannelLayoutId, readonly MatrixLayoutId[]> = {
  skyEarth: ["outer.top", "vertical.top", "center", "vertical.bottom", "outer.bottom"],
  love: ["outer.left", "horizontal.left", "center", "horizontal.right"],
  money: ["vertical.top", "center", "horizontal.right", "vertical.bottom"],
  male: ["outer.left", "outer.bottomLeft", "outer.bottomRight", "outer.right"],
  female: ["outer.topLeft", "outer.top", "outer.topRight"],
  karmicTail: ["vertical.bottom", "outer.bottom", "karmicTail.tip"],
};

export const MATRIX_V3_CHANNEL_PATHS: Record<MatrixChannelLayoutId, readonly MatrixLayoutId[]> = {
  ...MATRIX_CHANNEL_PATHS,
  male: ["outer.left", "maleLine.head", "outer.right", "outer.bottomRight"],
  female: ["outer.topLeft", "outer.top", "outer.topRight", "outer.bottomLeft"],
};

/** Ancestral diagonals: F–H (father) and G–I (mother). */
export const MATRIX_V5_CHANNEL_PATHS: Record<MatrixChannelLayoutId, readonly MatrixLayoutId[]> = {
  ...MATRIX_CHANNEL_PATHS,
  male: ["outer.topLeft", "outer.bottomRight"],
  female: ["outer.topRight", "outer.bottomLeft"],
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

export function ageRingRadius(): number {
  return MATRIX_RADIUS + AGE_RING_GAP;
}

/** True mathematical energy coordinate on the age ring. */
export function ageEnergyPosition(age: number): MatrixPoint2d {
  return polar(ageRingRadius(), ageSector(age).angle);
}

/**
 * Visual bead/label only. Age 60 shares the bottom vertex, so the numeral
 * is nudged off the node. Semantic angle stays ageSector(60).
 */
export function ageMarkPosition(age: number): MatrixPoint2d {
  if (age === 60) return polar(ageRingRadius(), -112);
  return ageEnergyPosition(age);
}

export function ageTickPosition(age: number): MatrixPoint2d {
  return ageMarkPosition(age);
}

export function layoutPoint(id: MatrixLayoutId): MatrixPoint2d {
  return MATRIX_NODE_LAYOUT[id];
}

export function polylineFor(ids: readonly MatrixLayoutId[]): string {
  return ids.map((id) => `${MATRIX_NODE_LAYOUT[id].x},${MATRIX_NODE_LAYOUT[id].y}`).join(" ");
}

export function sampleArc(
  fromDeg: number,
  toDeg: number,
  radius: number,
  steps = 16
): MatrixPoint2d[] {
  const out: MatrixPoint2d[] = [];
  for (let i = 0; i <= steps; i += 1) {
    out.push(polar(radius, fromDeg + ((toDeg - fromDeg) * i) / steps));
  }
  return out;
}

export function matrixViewBoxAttr(compact = false): string {
  const height = compact ? 980 : MATRIX_VIEWBOX.height;
  return `${MATRIX_VIEWBOX.minX} ${MATRIX_VIEWBOX.minY} ${MATRIX_VIEWBOX.width} ${height}`;
}
