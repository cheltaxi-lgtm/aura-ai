/**
 * Fixed Destiny Matrix geometry. Dates change arcana values, never coordinates.
 *
 * Regular octagon: personal diamond (L/T/R/B) + ancestral square (TL/TR/BR/BL).
 * Origin is SVG (y down). Angles are mathematical: 0° = right, 90° = up.
 */

export const MATRIX_VIEWBOX = { width: 1000, height: 1200 } as const;

export const MATRIX_ORIGIN = { x: 500, y: 428 } as const;
export const MATRIX_RADIUS = 248;

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

export const INNER_RATIO = 0.5;

function polar(radius: number, angleDeg: number): MatrixPoint2d {
  const a = angleDeg * DEG;
  return {
    x: round2(MATRIX_ORIGIN.x + radius * Math.cos(a)),
    y: round2(MATRIX_ORIGIN.y - radius * Math.sin(a)),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function centroid(points: readonly MatrixPoint2d[]): MatrixPoint2d {
  const x = points.reduce((s, p) => s + p.x, 0) / points.length;
  const y = points.reduce((s, p) => s + p.y, 0) / points.length;
  return { x: round2(x), y: round2(y) };
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

/** Male channel vertices A / C / CG — paternal sits at their centroid. */
const PATERNAL = centroid([LEFT, RIGHT, BOTTOM_RIGHT]);

const TAIL_GAP = 92;
const KARMIC_TIP: MatrixPoint2d = {
  x: MATRIX_ORIGIN.x,
  y: round2(BOTTOM.y + TAIL_GAP),
};

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
  "karmicTail.tip": KARMIC_TIP,
  "period.year": { x: 338, y: 1118 },
  "period.month": { x: 662, y: 1118 },
};

export const MATRIX_NODE_RADIUS: Record<MatrixLayoutId, number> = {
  "outer.left": 28,
  "outer.topLeft": 24,
  "outer.top": 28,
  "outer.topRight": 24,
  "outer.right": 28,
  "outer.bottomRight": 24,
  "outer.bottom": 28,
  "outer.bottomLeft": 24,
  center: 40,
  "vertical.top": 20,
  "vertical.bottom": 20,
  "horizontal.left": 20,
  "horizontal.right": 20,
  "maleLine.head": 18,
  "karmicTail.tip": 20,
  "period.year": 22,
  "period.month": 22,
};

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

export type MatrixChannelLayoutId = "skyEarth" | "love" | "money" | "male" | "female" | "karmicTail";

export const MATRIX_CHANNEL_PATHS: Record<MatrixChannelLayoutId, readonly MatrixLayoutId[]> = {
  skyEarth: ["outer.top", "vertical.top", "center", "vertical.bottom", "outer.bottom"],
  love: ["outer.left", "horizontal.left", "center", "horizontal.right"],
  money: ["vertical.top", "center", "horizontal.right", "vertical.bottom"],
  male: ["outer.left", "maleLine.head", "outer.right", "outer.bottomRight"],
  female: ["outer.bottomLeft", "outer.topLeft", "outer.top", "outer.topRight"],
  karmicTail: ["vertical.bottom", "outer.bottom", "karmicTail.tip"],
};

/** Age 0 starts at LEFT; +10y per outer vertex; +5y on each edge midpoint. */
export function ageMarkPosition(age: number): MatrixPoint2d {
  const clamped = ((age % 80) + 80) % 80;
  const sector = clamped / 10;
  const index = Math.floor(sector) % 8;
  const t = sector - index;
  const a0 = OUTER_ANGLE_DEG[OUTER_LAYOUT_IDS[index]!];
  const a1 = OUTER_ANGLE_DEG[OUTER_LAYOUT_IDS[(index + 1) % 8]!];
  let delta = a1 - a0;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const ageRadius = MATRIX_RADIUS + (t === 0 ? 56 : 40);
  return polar(ageRadius, a0 + delta * t);
}

export function layoutPoint(id: MatrixLayoutId): MatrixPoint2d {
  return MATRIX_NODE_LAYOUT[id];
}

export function polylineFor(ids: readonly MatrixLayoutId[]): string {
  return ids.map((id) => `${MATRIX_NODE_LAYOUT[id].x},${MATRIX_NODE_LAYOUT[id].y}`).join(" ");
}
