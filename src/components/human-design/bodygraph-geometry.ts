import type { HdCenterKey } from "@/lib/human-design";

/**
 * Bodygraph geometry, viewBox 0 0 400 700.
 * Classic layout: head/ajna triangles on top, throat square, G diamond,
 * heart triangle right of G, spleen/solar triangles on the sides,
 * sacral + root squares down the spine.
 */

export interface HdCenterShape {
  key: HdCenterKey;
  /** SVG path for the center outline. */
  path: string;
  /** Label anchor (center of the shape). */
  cx: number;
  cy: number;
}

export const HD_CENTER_SHAPES: Record<HdCenterKey, HdCenterShape> = {
  head: { key: "head", path: "M200 24 L158 92 L242 92 Z", cx: 200, cy: 68 },
  ajna: { key: "ajna", path: "M158 108 L242 108 L200 176 Z", cx: 200, cy: 136 },
  throat: { key: "throat", path: "M168 196 H232 V256 H168 Z", cx: 200, cy: 226 },
  g: { key: "g", path: "M200 300 L248 348 L200 396 L152 348 Z", cx: 200, cy: 348 },
  heart: { key: "heart", path: "M262 322 L262 364 L306 343 Z", cx: 274, cy: 343 },
  spleen: { key: "spleen", path: "M128 432 L128 520 L52 476 Z", cx: 100, cy: 476 },
  solar: { key: "solar", path: "M272 432 L272 520 L348 476 Z", cx: 300, cy: 476 },
  sacral: { key: "sacral", path: "M162 424 H238 V500 H162 Z", cx: 200, cy: 462 },
  root: { key: "root", path: "M162 556 H238 V632 H162 Z", cx: 200, cy: 594 },
};

export interface HdGateAnchor {
  gate: number;
  center: HdCenterKey;
  /** Channel attachment point on the center edge. */
  x: number;
  y: number;
  /** Label position (pushed outward from the shape). */
  lx: number;
  ly: number;
}

function anchor(
  gate: number,
  center: HdCenterKey,
  x: number,
  y: number,
  lx: number,
  ly: number
): HdGateAnchor {
  return { gate, center, x, y, lx, ly };
}

export const HD_GATE_ANCHORS: readonly HdGateAnchor[] = [
  // Head (bottom edge) — channels to ajna top
  anchor(64, "head", 176, 92, 176, 84),
  anchor(61, "head", 200, 92, 200, 84),
  anchor(63, "head", 224, 92, 224, 84),
  // Ajna top — from head
  anchor(47, "ajna", 176, 108, 176, 116),
  anchor(24, "ajna", 200, 108, 200, 116),
  anchor(4, "ajna", 224, 108, 224, 116),
  // Ajna bottom — to throat top
  anchor(11, "ajna", 172, 170, 164, 178),
  anchor(43, "ajna", 200, 176, 200, 186),
  anchor(17, "ajna", 228, 170, 236, 178),
  // Throat top — from ajna
  anchor(62, "throat", 176, 196, 168, 190),
  anchor(23, "throat", 200, 196, 200, 190),
  anchor(56, "throat", 224, 196, 232, 190),
  // Throat sides + bottom
  anchor(16, "throat", 168, 216, 158, 214),
  anchor(35, "throat", 232, 210, 242, 208),
  anchor(12, "throat", 232, 232, 242, 232),
  anchor(45, "throat", 232, 250, 242, 252),
  anchor(31, "throat", 176, 256, 170, 266),
  anchor(8, "throat", 192, 256, 188, 266),
  anchor(33, "throat", 208, 256, 210, 266),
  anchor(20, "throat", 224, 256, 230, 266),
  // G diamond
  anchor(7, "g", 176, 318, 166, 314),
  anchor(1, "g", 200, 300, 200, 292),
  anchor(13, "g", 224, 318, 234, 314),
  anchor(10, "g", 240, 332, 250, 328),
  anchor(25, "g", 248, 348, 258, 350),
  anchor(46, "g", 224, 378, 234, 384),
  anchor(2, "g", 200, 396, 200, 406),
  anchor(15, "g", 176, 378, 166, 384),
  // Heart
  anchor(51, "heart", 262, 343, 254, 336),
  anchor(21, "heart", 272, 324, 272, 314),
  anchor(40, "heart", 296, 352, 304, 360),
  anchor(26, "heart", 266, 358, 258, 366),
  // Spleen (right edge toward spine, bottom toward root)
  anchor(48, "spleen", 128, 444, 138, 440),
  anchor(57, "spleen", 128, 464, 138, 462),
  anchor(44, "spleen", 128, 484, 138, 486),
  anchor(50, "spleen", 128, 504, 138, 508),
  anchor(32, "spleen", 110, 514, 106, 526),
  anchor(28, "spleen", 88, 508, 84, 520),
  anchor(18, "spleen", 66, 500, 60, 512),
  // Solar (left edge toward spine, bottom toward root)
  anchor(36, "solar", 272, 444, 262, 440),
  anchor(22, "solar", 272, 464, 262, 462),
  anchor(37, "solar", 272, 484, 262, 486),
  anchor(6, "solar", 272, 504, 262, 508),
  anchor(49, "solar", 290, 514, 292, 526),
  anchor(55, "solar", 312, 508, 314, 520),
  anchor(30, "solar", 334, 500, 340, 512),
  // Sacral
  anchor(5, "sacral", 176, 424, 170, 416),
  anchor(14, "sacral", 200, 424, 200, 416),
  anchor(29, "sacral", 224, 424, 230, 416),
  anchor(34, "sacral", 238, 434, 248, 430),
  anchor(59, "sacral", 238, 448, 248, 450),
  anchor(27, "sacral", 162, 462, 152, 462),
  anchor(3, "sacral", 176, 500, 170, 510),
  anchor(9, "sacral", 200, 500, 200, 510),
  anchor(42, "sacral", 224, 500, 230, 510),
  // Root
  anchor(60, "root", 176, 556, 170, 548),
  anchor(52, "root", 200, 556, 200, 548),
  anchor(53, "root", 224, 556, 230, 548),
  anchor(54, "root", 162, 570, 152, 568),
  anchor(38, "root", 162, 590, 152, 590),
  anchor(58, "root", 162, 610, 152, 612),
  anchor(19, "root", 238, 570, 248, 568),
  anchor(39, "root", 238, 590, 248, 590),
  anchor(41, "root", 238, 610, 248, 612),
];

const ANCHOR_BY_GATE = new Map(HD_GATE_ANCHORS.map((a) => [a.gate, a]));

export function gateAnchor(gate: number): HdGateAnchor {
  const found = ANCHOR_BY_GATE.get(gate);
  if (!found) throw new Error(`No bodygraph anchor for gate ${gate}`);
  return found;
}

export interface HdChannelSegment {
  key: string;
  gates: [number, number];
  ax: number;
  ay: number;
  bx: number;
  by: number;
  mx: number;
  my: number;
}

/** All 36 channels as two half-segments (gate→mid, mid→gate) for P/D coloring. */
export const HD_CHANNEL_SEGMENTS: readonly HdChannelSegment[] = [
  [1, 8], [2, 14], [3, 60], [4, 63], [5, 15], [6, 59], [7, 31], [9, 52],
  [10, 20], [10, 34], [10, 57], [11, 56], [12, 22], [13, 33], [16, 48],
  [17, 62], [18, 58], [19, 49], [20, 34], [20, 57], [21, 45], [23, 43],
  [24, 61], [25, 51], [26, 44], [27, 50], [28, 38], [29, 46], [30, 41],
  [32, 54], [34, 57], [35, 36], [37, 40], [39, 55], [42, 53], [47, 64],
].map(([a, b]) => {
  const ga = gateAnchor(a!);
  const gb = gateAnchor(b!);
  return {
    key: `${a}-${b}`,
    gates: [a!, b!] as [number, number],
    ax: ga.x,
    ay: ga.y,
    bx: gb.x,
    by: gb.y,
    mx: (ga.x + gb.x) / 2,
    my: (ga.y + gb.y) / 2,
  };
});
