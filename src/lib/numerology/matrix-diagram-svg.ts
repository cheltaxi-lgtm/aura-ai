/**
 * Destiny Matrix SVG — filled octagram mandala for web, print, share, Telegram.
 */
import {
  ANCESTRAL_SQUARE_IDS,
  CENTER_HALO_RADIUS,
  INNER_RADIUS,
  MATRIX_CHANNEL_PATHS,
  MATRIX_V5_CHANNEL_PATHS,
  MATRIX_NODE_LAYOUT,
  MATRIX_NODE_RADIUS,
  MATRIX_ORIGIN,
  OUTER_LAYOUT_IDS,
  PERSONAL_DIAMOND_IDS,
  ageMarkPosition,
  ageRingRadius,
  ageSector,
  layoutPoint,
  polar,
  matrixViewBoxAttr,
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
  tint: string;
  diamond: string;
  square: string;
  axis: string;
  innerRing: string;
  bezel: string;
  beadFill: string;
  beadStroke: string;
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
  core: string;
  number: string;
  numberMajor: string;
  numberCenter: string;
  label: string;
  ageMajor: string;
  muted: string;
};

const FONT = "Georgia, 'Times New Roman', serif";

const DARK: ThemeTokens = {
  bg: "#12100e",
  tint: "rgba(196, 168, 112, 0.04)",
  diamond: "rgba(226, 208, 176, 0.52)",
  square: "rgba(168, 150, 186, 0.36)",
  axis: "rgba(226, 208, 176, 0.16)",
  innerRing: "rgba(226, 208, 176, 0.1)",
  bezel: "rgba(186, 168, 132, 0.28)",
  beadFill: "#1c1915",
  beadStroke: "rgba(226, 208, 176, 0.32)",
  love: "#b88990",
  money: "#b89a58",
  male: "#7a93a8",
  female: "#a888a0",
  tail: "#b48458",
  nodeFill: "#1a1714",
  nodeStroke: "rgba(226, 208, 176, 0.4)",
  nodeFillMajor: "#211c16",
  nodeStrokeMajor: "rgba(226, 208, 176, 0.7)",
  nodeFillCenter: "#2a2116",
  nodeStrokeCenter: "#d4b56a",
  halo: "rgba(212, 181, 106, 0.14)",
  core: "rgba(212, 181, 106, 0.06)",
  number: "#f2eadc",
  numberMajor: "#f7f0e2",
  numberCenter: "#fff6e4",
  label: "rgba(236, 226, 208, 0.78)",
  ageMajor: "rgba(236, 226, 208, 0.62)",
  muted: "rgba(236, 226, 208, 0.5)",
};

const PRINT: ThemeTokens = {
  bg: "#ffffff",
  tint: "rgba(138, 109, 47, 0.03)",
  diamond: "rgba(26, 24, 22, 0.55)",
  square: "rgba(72, 56, 88, 0.4)",
  axis: "rgba(26, 24, 22, 0.18)",
  innerRing: "rgba(26, 24, 22, 0.12)",
  bezel: "rgba(86, 70, 40, 0.32)",
  beadFill: "#ffffff",
  beadStroke: "rgba(26, 24, 22, 0.32)",
  love: "#8a4e58",
  money: "#8a6d2f",
  male: "#3d5870",
  female: "#704868",
  tail: "#7a5228",
  nodeFill: "#ffffff",
  nodeStroke: "rgba(26, 24, 22, 0.48)",
  nodeFillMajor: "#f6f1e6",
  nodeStrokeMajor: "rgba(26, 24, 22, 0.62)",
  nodeFillCenter: "#f3ead0",
  nodeStrokeCenter: "#6f5418",
  halo: "rgba(138, 109, 47, 0.2)",
  core: "rgba(138, 109, 47, 0.1)",
  number: "#1a1816",
  numberMajor: "#1a1816",
  numberCenter: "#1a1816",
  label: "rgba(26, 24, 22, 0.7)",
  ageMajor: "rgba(26, 24, 22, 0.72)",
  muted: "rgba(26, 24, 22, 0.46)",
};

type TypeScale = {
  center: number;
  major: number;
  secondary: number;
  inner: number;
  zone: number;
  ageMajor: number;
  helper: number;
};

function typeScale(compact: boolean): TypeScale {
  return compact
    ? { center: 54, major: 38, secondary: 30, inner: 28, zone: 16, ageMajor: 15, helper: 15 }
    : { center: 48, major: 32, secondary: 26, inner: 23, zone: 16, ageMajor: 13, helper: 14 };
}

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

function pts(points: ReadonlyArray<{ x: number; y: number }>): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function outerGeometry(t: ThemeTokens): string {
  const oct = OUTER_LAYOUT_IDS.map((id) => MATRIX_NODE_LAYOUT[id]);
  return [
    `<polygon fill="none" stroke="${t.diamond}" stroke-width="2.2" stroke-linejoin="round" points="${polylineFor(PERSONAL_DIAMOND_IDS)}"/>`,
    `<polygon fill="none" stroke="${t.square}" stroke-width="1.85" stroke-linejoin="round" points="${polylineFor(ANCESTRAL_SQUARE_IDS)}"/>`,
    `<polygon fill="none" stroke="${t.diamond}" stroke-width="0.9" stroke-linejoin="round" opacity="0.28" points="${pts(oct)}"/>`,
    `<circle cx="${MATRIX_ORIGIN.x}" cy="${MATRIX_ORIGIN.y}" r="${INNER_RADIUS}" fill="none" stroke="${t.innerRing}" stroke-width="1"/>`,
  ].join("");
}

function ageScale(t: ThemeTokens, compact: boolean, type: TypeScale): string {
  const ring = ageRingRadius();
  const beadR = compact ? 18 : 14;
  const majors = compact ? [0, 20, 40, 60] : [0, 10, 20, 30, 40, 50, 60, 70];
  const minors = compact ? [10, 30, 50, 70] : [5, 15, 25, 35, 45, 55, 65, 75];
  const ringPath = `<circle cx="${MATRIX_ORIGIN.x}" cy="${MATRIX_ORIGIN.y}" r="${ring}" fill="none" stroke="${t.bezel}" stroke-width="1.2"/>`;
  const ticks = minors
    .map((age) => {
      const { angle } = ageSector(age);
      const inner = polar(ring - 6, angle);
      const outer = polar(ring + 6, angle);
      return `<line data-age-tick="${age}" x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}" stroke="${t.bezel}" stroke-width="1.05" stroke-linecap="round"/>`;
    })
    .join("");
  const beads = majors
    .map((age) => {
      const p = ageMarkPosition(age);
      return `<g data-age="${age}">
        <circle cx="${p.x}" cy="${p.y}" r="${beadR}" fill="${t.beadFill}" stroke="${t.beadStroke}" stroke-width="1.15"/>
        <text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" font-size="${type.ageMajor}" fill="${t.ageMajor}" font-family="${FONT}">${age}</text>
      </g>`;
    })
    .join("");
  return ringPath + ticks + beads;
}

function axes(t: ThemeTokens): string {
  const L = MATRIX_NODE_LAYOUT["outer.left"];
  const R = MATRIX_NODE_LAYOUT["outer.right"];
  const T = MATRIX_NODE_LAYOUT["outer.top"];
  const B = MATRIX_NODE_LAYOUT["outer.bottom"];
  return [
    `<line x1="${L.x}" y1="${L.y}" x2="${R.x}" y2="${R.y}" stroke="${t.axis}" stroke-width="1.15"/>`,
    `<line x1="${T.x}" y1="${T.y}" x2="${B.x}" y2="${B.y}" stroke="${t.axis}" stroke-width="1.15"/>`,
  ].join("");
}

function channels(t: ThemeTokens): string {
  return [
    `<polyline fill="none" stroke="${t.love}" stroke-width="2.85" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(MATRIX_CHANNEL_PATHS.love)}"/>`,
    `<polyline fill="none" stroke="${t.money}" stroke-width="2.85" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(MATRIX_CHANNEL_PATHS.money)}"/>`,
  ].join("");
}

function generation(t: ThemeTokens, version: string): string {
  const base = version.split("@")[0];
  const v3 = base === "matrix-v3";
  const v5 = base === "matrix-v5";
  if (v3) {
    return [
      `<polyline fill="none" stroke="${t.male}" stroke-width="2.45" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(["outer.left", "maleLine.head", "outer.bottomRight"])}"/>`,
      `<polyline fill="none" stroke="${t.male}" stroke-width="1.85" stroke-linecap="round" points="${polylineFor(["maleLine.head", "outer.right"])}"/>`,
      `<polyline fill="none" stroke="${t.female}" stroke-width="2.45" stroke-linecap="round" points="${polylineFor(["outer.topRight", "outer.bottomLeft"])}"/>`,
      `<polyline fill="none" stroke="${t.female}" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(["outer.topLeft", "outer.top", "outer.topRight"])}"/>`,
    ].join("");
  }
  const paths = v5 ? MATRIX_V5_CHANNEL_PATHS : MATRIX_CHANNEL_PATHS;
  return [
    `<polyline fill="none" stroke="${t.male}" stroke-width="2.45" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(paths.male)}"/>`,
    `<polyline fill="none" stroke="${t.female}" stroke-width="2.45" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(paths.female)}"/>`,
  ].join("");
}

function tailSpine(t: ThemeTokens): string {
  return `<polyline fill="none" stroke="${t.tail}" stroke-width="2.65" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(MATRIX_CHANNEL_PATHS.karmicTail)}"/>`;
}

function nodeLook(
  node: MatrixSemanticNode,
  focused: boolean,
  t: ThemeTokens,
  type: TypeScale
): { fill: string; stroke: string; sw: number; num: string; numSize: number } {
  if (node.role === "center") {
    return {
      fill: t.nodeFillCenter,
      stroke: t.nodeStrokeCenter,
      sw: 2.8,
      num: t.numberCenter,
      numSize: type.center,
    };
  }
  if (node.id === "horizontal.left") {
    return {
      fill: t.nodeFill,
      stroke: t.love,
      sw: 2.1,
      num: t.number,
      numSize: node.number > 9 ? type.inner : type.secondary,
    };
  }
  if (node.id === "horizontal.right") {
    return {
      fill: t.nodeFill,
      stroke: t.money,
      sw: 2.1,
      num: t.number,
      numSize: node.number > 9 ? type.inner : type.secondary,
    };
  }
  if (node.id === "vertical.top") {
    return {
      fill: t.nodeFill,
      stroke: t.money,
      sw: 1.9,
      num: t.number,
      numSize: node.number > 9 ? type.inner : type.secondary,
    };
  }
  if (node.id === "outer.topRight" || node.id === "outer.topLeft" || node.id === "outer.bottomLeft") {
    return {
      fill: t.nodeFill,
      stroke: focused ? t.nodeStrokeCenter : t.female,
      sw: focused ? 2.1 : 1.8,
      num: t.number,
      numSize: node.number > 9 ? type.inner : type.secondary,
    };
  }
  if (node.id === "outer.bottomRight") {
    return {
      fill: t.nodeFill,
      stroke: focused ? t.nodeStrokeCenter : t.male,
      sw: focused ? 2.1 : 1.8,
      num: t.number,
      numSize: node.number > 9 ? type.inner : type.secondary,
    };
  }
  if (node.id === "maleLine.head") {
    return {
      fill: t.nodeFill,
      stroke: t.male,
      sw: 2.1,
      num: t.number,
      numSize: node.number > 9 ? type.inner : type.secondary,
    };
  }
  if (node.id === "outer.bottom") {
    return {
      fill: t.nodeFillMajor,
      stroke: t.tail,
      sw: 1.9,
      num: t.numberMajor,
      numSize: node.number > 9 ? type.major - 2 : type.major,
    };
  }
  if (node.id === "karmicTail.tip" || node.id === "vertical.bottom") {
    return {
      fill: t.nodeFill,
      stroke: t.tail,
      sw: 2.1,
      num: t.number,
      numSize: node.number > 9 ? type.inner : type.secondary,
    };
  }
  if (node.role === "outer" && ["outer.left", "outer.top", "outer.right", "outer.bottom"].includes(node.id)) {
    return {
      fill: t.nodeFillMajor,
      stroke: focused ? t.nodeStrokeCenter : t.nodeStrokeMajor,
      sw: focused ? 2.4 : 1.9,
      num: t.numberMajor,
      numSize: node.number > 9 ? type.major - 2 : type.major,
    };
  }
  return {
    fill: t.nodeFill,
    stroke: focused ? t.nodeStrokeCenter : t.nodeStroke,
    sw: focused ? 2.1 : 1.55,
    num: t.number,
    numSize: node.number > 9 ? type.inner : type.secondary,
  };
}

function nodesLayer(
  model: MatrixSemanticModel,
  t: ThemeTokens,
  revealed: number,
  focusKey: string,
  type: TypeScale
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
      const look = nodeLook(n, focused, t, type);
      const halo =
        n.role === "center"
          ? `<circle cx="${p.x}" cy="${p.y}" r="${CENTER_HALO_RADIUS}" fill="none" stroke="${t.halo}" stroke-width="3.2"/>`
          : "";
      return `<g data-node="${n.id}" opacity="${visible(n, revealed) ? 1 : 0}">
        ${halo}
        <circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${look.fill}" stroke="${look.stroke}" stroke-width="${look.sw}"/>
        <circle data-node-hit="${n.id}" cx="${p.x}" cy="${p.y}" r="${Math.max(r + 10, 22)}" fill="transparent" style="cursor:pointer"/>
      </g>`;
    })
    .join("");
}

function valuesLayer(
  model: MatrixSemanticModel,
  t: ThemeTokens,
  revealed: number,
  focusKey: string,
  type: TypeScale
): string {
  const skip = new Set<MatrixLayoutId>(["period.year", "period.month"]);
  return model.nodes
    .filter((n) => !skip.has(n.id))
    .map((n) => {
      const p = layoutPoint(n.id);
      const focused = isNodeFocused(n, focusKey);
      const look = nodeLook(n, focused, t, type);
      return `<text data-value="${n.id}" x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" font-size="${look.numSize}" font-weight="600" fill="${look.num}" font-family="${FONT}" opacity="${visible(n, revealed) ? 1 : 0}">${n.number}</text>`;
    })
    .join("");
}

function markers(t: ThemeTokens): string {
  const love = MATRIX_NODE_LAYOUT["horizontal.left"];
  const money = MATRIX_NODE_LAYOUT["horizontal.right"];
  return [
    `<text x="${love.x}" y="${love.y - 36}" text-anchor="middle" font-size="12" fill="${t.love}" font-family="${FONT}">♥</text>`,
    `<text x="${money.x}" y="${money.y - 36}" text-anchor="middle" font-size="12" fill="${t.money}" font-family="${FONT}">$</text>`,
  ].join("");
}

function zoneLabels(t: ThemeTokens, compact: boolean, type: TypeScale, version: string): string {
  const left = MATRIX_NODE_LAYOUT["outer.left"];
  const top = MATRIX_NODE_LAYOUT["outer.top"];
  const right = MATRIX_NODE_LAYOUT["outer.right"];
  const love = MATRIX_NODE_LAYOUT["horizontal.left"];
  const money = MATRIX_NODE_LAYOUT["horizontal.right"];
  const v3 = version.split("@")[0] === "matrix-v3";
  const paternal = v3 ? MATRIX_NODE_LAYOUT["maleLine.head"] : MATRIX_NODE_LAYOUT["outer.bottomRight"];
  const mother = MATRIX_NODE_LAYOUT["outer.topRight"];
  const tip = MATRIX_NODE_LAYOUT["karmicTail.tip"];
  const zone = [
    `<text x="${left.x}" y="${left.y - 62}" text-anchor="middle" font-size="${type.zone}" letter-spacing="0.4" fill="${t.label}" font-family="${FONT}">Характер</text>`,
    `<text x="${top.x + 64}" y="${top.y + 4}" text-anchor="start" font-size="${type.zone}" letter-spacing="0.4" fill="${t.label}" font-family="${FONT}">Небо</text>`,
    `<text x="${right.x}" y="${right.y - 62}" text-anchor="middle" font-size="${type.zone}" letter-spacing="0.4" fill="${t.label}" font-family="${FONT}">Материя</text>`,
  ];
  const lineage = [
    `<text x="${paternal.x - 34}" y="${paternal.y + 42}" text-anchor="end" font-size="${type.helper}" letter-spacing="0.45" fill="${t.male}" font-family="${FONT}">Мужская линия</text>`,
    `<text x="${mother.x - 84}" y="${mother.y + 20}" text-anchor="end" font-size="${type.helper}" letter-spacing="0.45" fill="${t.female}" font-family="${FONT}">Женская линия</text>`,
    `<text x="${tip.x + 46}" y="${tip.y + 24}" text-anchor="start" font-size="${type.helper}" letter-spacing="0.35" fill="${t.tail}" font-family="${FONT}">Кармический хвост</text>`,
  ];
  if (compact) return [...zone, ...lineage].join("");
  return [
    ...zone,
    `<text x="${(left.x + love.x) / 2}" y="${love.y - 48}" text-anchor="middle" font-size="${type.helper}" letter-spacing="0.35" fill="${t.love}" font-family="${FONT}">Отношения</text>`,
    `<text x="${money.x + 42}" y="${money.y - 40}" text-anchor="start" font-size="${type.helper}" letter-spacing="0.35" fill="${t.money}" font-family="${FONT}">Деньги</text>`,
    ...lineage,
  ].join("");
}


function periodLayer(
  model: MatrixSemanticModel,
  t: ThemeTokens,
  revealed: number
): string {
  const year = model.nodes.find((n) => n.id === "period.year");
  const month = model.nodes.find((n) => n.id === "period.month");
  if (!year || !month) return "";
  const shown = visible(year, revealed) && visible(month, revealed);
  return `<g data-node="period" opacity="${shown ? 1 : 0}">
    <rect x="196" y="994" width="608" height="58" rx="12" fill="${t.core}" stroke="${t.bezel}" stroke-width="0.8"/>
    <text x="330" y="1018" text-anchor="middle" font-size="11" letter-spacing="0.8" fill="${t.muted}" font-family="${FONT}">Аркан года</text>
    <text x="330" y="1040" text-anchor="middle" font-size="17" font-weight="600" fill="${t.number}" font-family="${FONT}">${year.number} · ${esc(year.arcanaName)}</text>
    <line x1="500" y1="1008" x2="500" y2="1038" stroke="${t.bezel}" stroke-width="0.8"/>
    <text x="670" y="1018" text-anchor="middle" font-size="11" letter-spacing="0.8" fill="${t.muted}" font-family="${FONT}">Аркан месяца</text>
    <text x="670" y="1040" text-anchor="middle" font-size="17" font-weight="600" fill="${t.number}" font-family="${FONT}">${month.number} · ${esc(month.arcanaName)}</text>
  </g>`;
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
  const type = typeScale(compact);
  const revealed = options.revealed ?? 99;
  const focusKey = options.focusKey ?? model.focusKey;
  const uid = options.uid ?? "mx";
  const showPeriod = options.showPeriod !== false;
  const showAge = options.showAgeMarks !== false;
  const title = options.title ?? "Матрица судьбы — 22 аркана";

  const body = `<title id="${uid}-title">${esc(title)}</title>
  ${a11yList(model)}
  <rect width="100%" height="100%" fill="${t.bg}"/>
  <g data-layer="outer-geometry">${outerGeometry(t)}</g>
  ${showAge ? `<g data-layer="age-scale">${ageScale(t, compact, type)}</g>` : ""}
  <g data-layer="structural-axes">${axes(t)}</g>
  <g data-layer="semantic-channels">${channels(t)}</g>
  <g data-layer="generation-lines">${generation(t, model.calculationVersion)}</g>
  <g data-layer="secondary-connections">${tailSpine(t)}</g>
  <g data-layer="nodes">${nodesLayer(model, t, revealed, focusKey, type)}</g>
  <g data-layer="node-values">${valuesLayer(model, t, revealed, focusKey, type)}</g>
  <g data-layer="markers">${markers(t)}</g>
  <g data-layer="labels">${zoneLabels(t, compact, type, model.calculationVersion)}</g>
  ${showPeriod ? `<g data-layer="period">${periodLayer(model, t, revealed)}</g>` : ""}
  <g data-layer="interactive"></g>`;

  if (options.fragment) {
    return `<g class="destiny-matrix-svg">${body}</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${matrixViewBoxAttr(compact && !showPeriod)}" role="img" aria-labelledby="${uid}-title" class="destiny-matrix-svg destiny-matrix-svg--interactive">
  ${body}
</svg>`;
}

export function buildMatrixDiagramSvgFromResult(
  matrix: DestinyMatrixResult,
  options?: MatrixDiagramSvgOptions
): string {
  return buildMatrixDiagramSvg(buildMatrixSemanticModel(matrix), options);
}
