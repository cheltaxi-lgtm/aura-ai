/**
 * Destiny Matrix v2 SVG — one renderer for web, print, share, Telegram.
 */
import {
  ANCESTRAL_SQUARE_IDS,
  CENTER_HALO_RADIUS,
  MATRIX_CHANNEL_PATHS,
  MATRIX_NODE_LAYOUT,
  MATRIX_NODE_RADIUS,
  MATRIX_ORIGIN,
  MATRIX_VIEWBOX,
  OUTER_LAYOUT_IDS,
  PERSONAL_DIAMOND_IDS,
  ageBezelPoints,
  ageMarkPosition,
  ageTickPosition,
  layoutPoint,
  polylineFor,
  type MatrixLayoutId,
} from "./matrix-layout";
import type { DestinyMatrixResult } from "./destiny-matrix";
import {
  buildMatrixSemanticModel,
  isNodeFocused,
  type MatrixSemanticModel,
  type MatrixSemanticNode,
} from "./matrix-semantic-model";

export type MatrixDiagramTheme = "dark" | "print";
export type MatrixDiagramDensity = "full" | "compact";

export type MatrixDiagramSvgOptions = {
  theme?: MatrixDiagramTheme;
  density?: MatrixDiagramDensity;
  revealed?: number;
  focusKey?: string | null;
  title?: string;
  showPeriod?: boolean;
  showAgeMarks?: boolean;
  showChannelMarks?: boolean;
  uid?: string;
  fragment?: boolean;
};

type ThemeTokens = {
  bg: string;
  frame: string;
  octagon: string;
  diamond: string;
  square: string;
  axis: string;
  bezel: string;
  love: string;
  money: string;
  male: string;
  female: string;
  tail: string;
  nodeFill: string;
  nodeStroke: string;
  nodeFillMajor: string;
  nodeStrokeMajor: string;
  nodeFillCenter: string;
  nodeStrokeCenter: string;
  halo: string;
  number: string;
  numberMajor: string;
  numberCenter: string;
  label: string;
  ageMajor: string;
  ageMinor: string;
  muted: string;
};

const FONT = "Georgia, 'Times New Roman', serif";

const DARK: ThemeTokens = {
  bg: "#100e0c",
  frame: "rgba(201,162,74,0.14)",
  octagon: "rgba(232,214,180,0.55)",
  diamond: "rgba(232,214,180,0.28)",
  square: "rgba(168,150,190,0.32)",
  axis: "rgba(232,214,180,0.2)",
  bezel: "rgba(201,162,74,0.38)",
  love: "#b88990",
  money: "#c4a056",
  male: "#7f97ad",
  female: "#b08aa8",
  tail: "#b48458",
  nodeFill: "#1a1714",
  nodeStroke: "rgba(232,214,180,0.42)",
  nodeFillMajor: "#1d1a16",
  nodeStrokeMajor: "rgba(232,214,180,0.62)",
  nodeFillCenter: "#241c12",
  nodeStrokeCenter: "#d4b56a",
  halo: "rgba(212,181,106,0.22)",
  number: "#f0e8d8",
  numberMajor: "#f6efe0",
  numberCenter: "#fff6e4",
  label: "rgba(240,232,216,0.72)",
  ageMajor: "rgba(240,232,216,0.7)",
  ageMinor: "rgba(240,232,216,0.42)",
  muted: "rgba(240,232,216,0.42)",
};

const PRINT: ThemeTokens = {
  bg: "#ffffff",
  frame: "rgba(26,24,22,0.12)",
  octagon: "rgba(26,24,22,0.62)",
  diamond: "rgba(26,24,22,0.32)",
  square: "rgba(72,56,88,0.38)",
  axis: "rgba(26,24,22,0.22)",
  bezel: "rgba(110,86,36,0.45)",
  love: "#8a4e58",
  money: "#8a6d2f",
  male: "#3d5870",
  female: "#704868",
  tail: "#7a5228",
  nodeFill: "#ffffff",
  nodeStroke: "rgba(26,24,22,0.5)",
  nodeFillMajor: "#f7f3ea",
  nodeStrokeMajor: "rgba(26,24,22,0.62)",
  nodeFillCenter: "#f4ead2",
  nodeStrokeCenter: "#6f5418",
  halo: "rgba(138,109,47,0.22)",
  number: "#1a1816",
  numberMajor: "#1a1816",
  numberCenter: "#1a1816",
  label: "rgba(26,24,22,0.68)",
  ageMajor: "rgba(26,24,22,0.62)",
  ageMinor: "rgba(26,24,22,0.4)",
  muted: "rgba(26,24,22,0.45)",
};

const TYPE = {
  center: 44,
  major: 30,
  secondary: 24,
  inner: 22,
  zone: 16,
  ageMajor: 17,
  ageMinor: 13,
  helper: 13,
} as const;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function visible(node: MatrixSemanticNode, revealed: number): boolean {
  if (revealed >= 99) return true;
  if (node.revealIndex < 0) return revealed >= 8;
  return node.revealIndex < revealed;
}

function pts(points: Array<{ x: number; y: number }>): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function outerGeometry(t: ThemeTokens): string {
  const oct = OUTER_LAYOUT_IDS.map((id) => MATRIX_NODE_LAYOUT[id]);
  return [
    `<polygon fill="none" stroke="${t.octagon}" stroke-width="3.2" stroke-linejoin="round" points="${pts(oct)}"/>`,
    `<polygon fill="none" stroke="${t.diamond}" stroke-width="1.35" points="${polylineFor(PERSONAL_DIAMOND_IDS)}"/>`,
    `<polygon fill="none" stroke="${t.square}" stroke-width="1.25" points="${polylineFor(ANCESTRAL_SQUARE_IDS)}"/>`,
  ].join("");
}

function ageScale(
  model: MatrixSemanticModel,
  t: ThemeTokens,
  compact: boolean
): string {
  const bezel = ageBezelPoints();
  const ring = `<polygon fill="none" stroke="${t.bezel}" stroke-width="1.7" stroke-linejoin="round" points="${pts(bezel)}"/>`;
  const marks = model.ageMarks
    .filter((mark) => !compact || mark.age % 10 === 0)
    .map((mark) => {
      const major = mark.age % 10 === 0;
      const tick = ageTickPosition(mark.age);
      const label = ageMarkPosition(mark.age);
      const inward = {
        x: tick.x + (MATRIX_ORIGIN.x - tick.x) * 0.045,
        y: tick.y + (MATRIX_ORIGIN.y - tick.y) * 0.045,
      };
      const size = major ? TYPE.ageMajor : TYPE.ageMinor;
      const fill = major ? t.ageMajor : t.ageMinor;
      return `<g data-age="${mark.age}">
        <line x1="${tick.x}" y1="${tick.y}" x2="${inward.x}" y2="${inward.y}" stroke="${t.bezel}" stroke-width="${major ? 2.2 : 1.15}"/>
        <text x="${label.x}" y="${label.y}" text-anchor="middle" dominant-baseline="middle" font-size="${size}" fill="${fill}" font-family="${FONT}">${mark.age}</text>
      </g>`;
    })
    .join("");
  return ring + marks;
}

function axes(t: ThemeTokens): string {
  const L = MATRIX_NODE_LAYOUT["outer.left"];
  const R = MATRIX_NODE_LAYOUT["outer.right"];
  const T = MATRIX_NODE_LAYOUT["outer.top"];
  const B = MATRIX_NODE_LAYOUT["outer.bottom"];
  return [
    `<line x1="${L.x}" y1="${L.y}" x2="${R.x}" y2="${R.y}" stroke="${t.axis}" stroke-width="1.2"/>`,
    `<line x1="${T.x}" y1="${T.y}" x2="${B.x}" y2="${B.y}" stroke="${t.axis}" stroke-width="1.2"/>`,
  ].join("");
}

function channels(t: ThemeTokens): string {
  return [
    `<polyline fill="none" stroke="${t.love}" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(MATRIX_CHANNEL_PATHS.love)}"/>`,
    `<polyline fill="none" stroke="${t.money}" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(MATRIX_CHANNEL_PATHS.money)}"/>`,
  ].join("");
}

function generation(t: ThemeTokens): string {
  return [
    `<polyline fill="none" stroke="${t.male}" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(MATRIX_CHANNEL_PATHS.male)}"/>`,
    `<polyline fill="none" stroke="${t.female}" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(MATRIX_CHANNEL_PATHS.female)}"/>`,
  ].join("");
}

function tailSpine(t: ThemeTokens): string {
  return `<polyline fill="none" stroke="${t.tail}" stroke-width="3" stroke-linecap="round" points="${polylineFor(MATRIX_CHANNEL_PATHS.karmicTail)}"/>`;
}

function nodeLook(
  node: MatrixSemanticNode,
  focused: boolean,
  t: ThemeTokens
): { fill: string; stroke: string; sw: number; num: string; numSize: number } {
  if (node.role === "center") {
    return {
      fill: focused ? t.nodeFillCenter : t.nodeFillCenter,
      stroke: focused ? t.nodeStrokeCenter : t.nodeStrokeCenter,
      sw: 2.6,
      num: t.numberCenter,
      numSize: TYPE.center,
    };
  }
  if (node.role === "outer" && ["outer.left", "outer.top", "outer.right", "outer.bottom"].includes(node.id)) {
    return {
      fill: t.nodeFillMajor,
      stroke: focused ? t.nodeStrokeCenter : t.nodeStrokeMajor,
      sw: focused ? 2.4 : 1.8,
      num: t.numberMajor,
      numSize: node.number > 9 ? TYPE.major - 2 : TYPE.major,
    };
  }
  return {
    fill: t.nodeFill,
    stroke: focused ? t.nodeStrokeCenter : t.nodeStroke,
    sw: focused ? 2.1 : 1.5,
    num: t.number,
    numSize: node.number > 9 ? TYPE.inner : TYPE.secondary,
  };
}

function nodesLayer(
  model: MatrixSemanticModel,
  t: ThemeTokens,
  revealed: number,
  focusKey: string
): string {
  const skip = new Set<MatrixLayoutId>(["period.year", "period.month"]);
  const ordered = [...model.nodes].sort((a, b) => {
    if (a.role === "center") return 1;
    if (b.role === "center") return -1;
    return 0;
  });
  return ordered
    .filter((n) => !skip.has(n.id))
    .map((n) => {
      const p = layoutPoint(n.id);
      const r = MATRIX_NODE_RADIUS[n.id];
      const focused = isNodeFocused(n, focusKey);
      const look = nodeLook(n, focused, t);
      const halo =
        n.role === "center"
          ? `<circle cx="${p.x}" cy="${p.y}" r="${CENTER_HALO_RADIUS}" fill="none" stroke="${t.halo}" stroke-width="8"/>`
          : "";
      return `<g data-node="${n.id}" opacity="${visible(n, revealed) ? 1 : 0}">
        ${halo}
        <circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${look.fill}" stroke="${look.stroke}" stroke-width="${look.sw}"/>
      </g>`;
    })
    .join("");
}

function valuesLayer(
  model: MatrixSemanticModel,
  t: ThemeTokens,
  revealed: number,
  focusKey: string
): string {
  const skip = new Set<MatrixLayoutId>(["period.year", "period.month"]);
  return model.nodes
    .filter((n) => !skip.has(n.id))
    .map((n) => {
      const p = layoutPoint(n.id);
      const focused = isNodeFocused(n, focusKey);
      const look = nodeLook(n, focused, t);
      return `<text data-value="${n.id}" x="${p.x}" y="${p.y + 1}" text-anchor="middle" dominant-baseline="central" font-size="${look.numSize}" font-weight="700" fill="${look.num}" font-family="${FONT}" opacity="${visible(n, revealed) ? 1 : 0}">${n.number}</text>`;
    })
    .join("");
}

function markers(t: ThemeTokens): string {
  const love = MATRIX_NODE_LAYOUT["horizontal.left"];
  const money = MATRIX_NODE_LAYOUT["horizontal.right"];
  const r = MATRIX_NODE_RADIUS["horizontal.left"];
  return [
    `<text x="${love.x}" y="${love.y + r + 18}" text-anchor="middle" font-size="14" fill="${t.love}" font-family="${FONT}">♥</text>`,
    `<text x="${money.x}" y="${money.y + r + 18}" text-anchor="middle" font-size="14" fill="${t.money}" font-family="${FONT}">$</text>`,
  ].join("");
}

function zoneLabels(t: ThemeTokens, compact: boolean): string {
  if (compact) return "";
  const L = MATRIX_NODE_LAYOUT["outer.left"];
  const T = MATRIX_NODE_LAYOUT["outer.top"];
  const R = MATRIX_NODE_LAYOUT["outer.right"];
  const love = MATRIX_NODE_LAYOUT["horizontal.left"];
  const money = MATRIX_NODE_LAYOUT["horizontal.right"];
  const paternal = MATRIX_NODE_LAYOUT["maleLine.head"];
  const mother = MATRIX_NODE_LAYOUT["outer.topRight"];
  const tip = MATRIX_NODE_LAYOUT["karmicTail.tip"];
  return [
    `<text x="${L.x}" y="${L.y - 72}" text-anchor="middle" font-size="${TYPE.zone}" fill="${t.label}" font-family="${FONT}">Характер</text>`,
    `<text x="${T.x + 62}" y="${T.y + 8}" text-anchor="start" font-size="${TYPE.zone}" fill="${t.label}" font-family="${FONT}">Небо</text>`,
    `<text x="${R.x}" y="${R.y - 72}" text-anchor="middle" font-size="${TYPE.zone}" fill="${t.label}" font-family="${FONT}">Материя</text>`,
    `<text x="${love.x}" y="${love.y - 50}" text-anchor="middle" font-size="${TYPE.helper}" fill="${t.love}" font-family="${FONT}">Отношения</text>`,
    `<text x="${money.x}" y="${money.y - 50}" text-anchor="middle" font-size="${TYPE.helper}" fill="${t.money}" font-family="${FONT}">Деньги</text>`,
    `<text x="${paternal.x + 36}" y="${paternal.y + 40}" text-anchor="start" font-size="${TYPE.helper}" fill="${t.male}" font-family="${FONT}">♂ род</text>`,
    `<text x="${mother.x + 44}" y="${mother.y - 36}" text-anchor="start" font-size="${TYPE.helper}" fill="${t.female}" font-family="${FONT}">♀ род</text>`,
    `<text x="${tip.x + 58}" y="${tip.y + 6}" text-anchor="start" font-size="${TYPE.helper}" fill="${t.tail}" font-family="${FONT}">Кармический хвост</text>`,
  ].join("");
}

function periodLayer(
  model: MatrixSemanticModel,
  t: ThemeTokens,
  revealed: number
): string {
  return model.nodes
    .filter((n) => n.id === "period.year" || n.id === "period.month")
    .map((n) => {
      const p = layoutPoint(n.id);
      return `<g data-node="${n.id}" opacity="${visible(n, revealed) ? 1 : 0}">
        <text x="${p.x}" y="${p.y - 10}" text-anchor="middle" font-size="${TYPE.helper}" fill="${t.muted}" font-family="${FONT}">${esc(n.label)}</text>
        <text x="${p.x}" y="${p.y + 14}" text-anchor="middle" font-size="20" font-weight="700" fill="${t.number}" font-family="${FONT}">${n.number} · ${esc(n.arcanaName)}</text>
      </g>`;
    })
    .join("");
}

function a11yList(model: MatrixSemanticModel): string {
  return `<desc>${esc(model.nodes.map((n) => `${n.label}: ${n.number} ${n.arcanaName}`).join("; "))}</desc>`;
}

export function buildMatrixDiagramSvg(
  model: MatrixSemanticModel,
  options: MatrixDiagramSvgOptions = {}
): string {
  const theme = options.theme ?? "dark";
  const t = theme === "print" ? PRINT : DARK;
  const compact = options.density === "compact";
  const revealed = options.revealed ?? 99;
  const focusKey = options.focusKey ?? model.focusKey;
  const uid = options.uid ?? "mx";
  const showPeriod = options.showPeriod !== false && !compact;
  const showAge = options.showAgeMarks !== false;
  const title = options.title ?? "Матрица судьбы — 22 аркана";

  const body = `<title id="${uid}-title">${esc(title)}</title>
  ${a11yList(model)}
  <rect width="100%" height="100%" fill="${t.bg}"/>
  <g data-layer="outer-geometry">${outerGeometry(t)}</g>
  ${showAge ? `<g data-layer="age-scale">${ageScale(model, t, compact)}</g>` : ""}
  <g data-layer="structural-axes">${axes(t)}</g>
  <g data-layer="semantic-channels">${channels(t)}</g>
  <g data-layer="generation-lines">${generation(t)}</g>
  <g data-layer="secondary-connections">${tailSpine(t)}</g>
  <g data-layer="nodes">${nodesLayer(model, t, revealed, focusKey)}</g>
  <g data-layer="node-values">${valuesLayer(model, t, revealed, focusKey)}</g>
  <g data-layer="markers">${markers(t)}</g>
  <g data-layer="labels">${zoneLabels(t, compact)}</g>
  ${showPeriod ? `<g data-layer="period">${periodLayer(model, t, revealed)}</g>` : ""}`;

  if (options.fragment) {
    return `<g class="destiny-matrix-svg">${body}</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MATRIX_VIEWBOX.minX} ${MATRIX_VIEWBOX.minY} ${MATRIX_VIEWBOX.width - MATRIX_VIEWBOX.minX * 2} ${MATRIX_VIEWBOX.height - MATRIX_VIEWBOX.minY - 8}" role="img" aria-labelledby="${uid}-title" class="destiny-matrix-svg">
  ${body}
</svg>`;
}

export function buildMatrixDiagramSvgFromResult(
  matrix: DestinyMatrixResult,
  options?: MatrixDiagramSvgOptions
): string {
  return buildMatrixDiagramSvg(buildMatrixSemanticModel(matrix), options);
}
