/**
 * Destiny Matrix SVG — filled octagram mandala for web, print, share, Telegram.
 */
import {
  CENTER_CORE_RADIUS,
  CENTER_HALO_RADIUS,
  GENERATION_RIBBON_RADIUS,
  INNER_RADIUS,
  MATRIX_CHANNEL_PATHS,
  MATRIX_NODE_LAYOUT,
  MATRIX_NODE_RADIUS,
  MATRIX_ORIGIN,
  OUTER_LAYOUT_IDS,
  STAR_OUTLINE,
  ageMarkPosition,
  ageRingRadius,
  layoutPoint,
  matrixViewBoxAttr,
  polar,
  polylineFor,
  sampleArc,
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
  plate: string;
  starFill: string;
  contour: string;
  contourSoft: string;
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
  plate: "rgba(196, 168, 112, 0.08)",
  starFill: "rgba(176, 148, 108, 0.34)",
  contour: "rgba(226, 208, 176, 0.82)",
  contourSoft: "rgba(196, 168, 112, 0.2)",
  axis: "rgba(226, 208, 176, 0.16)",
  innerRing: "rgba(226, 208, 176, 0.14)",
  bezel: "rgba(186, 168, 132, 0.62)",
  beadFill: "#1c1915",
  beadStroke: "rgba(226, 208, 176, 0.48)",
  love: "#c48a92",
  money: "#c4a45a",
  male: "#7f9ab0",
  female: "#b48aa8",
  tail: "#c48a5a",
  nodeFill: "#1a1714",
  nodeStroke: "rgba(226, 208, 176, 0.4)",
  nodeFillMajor: "#211c16",
  nodeStrokeMajor: "rgba(226, 208, 176, 0.7)",
  nodeFillCenter: "#2a2116",
  nodeStrokeCenter: "#d4b56a",
  halo: "rgba(212, 181, 106, 0.2)",
  core: "rgba(212, 181, 106, 0.1)",
  number: "#f2eadc",
  numberMajor: "#f7f0e2",
  numberCenter: "#fff6e4",
  label: "rgba(236, 226, 208, 0.78)",
  ageMajor: "rgba(236, 226, 208, 0.88)",
  muted: "rgba(236, 226, 208, 0.46)",
};

const PRINT: ThemeTokens = {
  bg: "#ffffff",
  plate: "rgba(138, 109, 47, 0.05)",
  starFill: "rgba(138, 109, 47, 0.14)",
  contour: "rgba(26, 24, 22, 0.72)",
  contourSoft: "rgba(26, 24, 22, 0.1)",
  axis: "rgba(26, 24, 22, 0.16)",
  innerRing: "rgba(26, 24, 22, 0.14)",
  bezel: "rgba(86, 70, 40, 0.5)",
  beadFill: "#ffffff",
  beadStroke: "rgba(26, 24, 22, 0.45)",
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
    ? { center: 54, major: 38, secondary: 30, inner: 28, zone: 0, ageMajor: 18, helper: 15 }
    : { center: 48, major: 32, secondary: 26, inner: 24, zone: 15, ageMajor: 15, helper: 13 };
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
  const ring = ageRingRadius();
  return [
    `<circle cx="${MATRIX_ORIGIN.x}" cy="${MATRIX_ORIGIN.y}" r="${ring}" fill="${t.plate}" stroke="none"/>`,
    `<polygon fill="none" stroke="${t.contourSoft}" stroke-width="18" stroke-linejoin="round" points="${pts(STAR_OUTLINE)}"/>`,
    `<polygon fill="${t.starFill}" stroke="${t.contour}" stroke-width="4.4" stroke-linejoin="round" points="${pts(STAR_OUTLINE)}"/>`,
    `<polygon fill="none" stroke="${t.contour}" stroke-width="1.2" stroke-linejoin="round" opacity="0.45" points="${pts(oct)}"/>`,
    `<circle cx="${MATRIX_ORIGIN.x}" cy="${MATRIX_ORIGIN.y}" r="${INNER_RADIUS}" fill="none" stroke="${t.innerRing}" stroke-width="1.35"/>`,
  ].join("");
}

function ageScale(t: ThemeTokens, compact: boolean, type: TypeScale): string {
  const ring = ageRingRadius();
  const beadR = compact ? 21 : 17;
  const majors = compact ? [0, 20, 40, 60] : [0, 10, 20, 30, 40, 50, 60, 70];
  const minors = compact ? [10, 30, 50, 70] : [5, 15, 25, 35, 45, 55, 65, 75];
  const ringPath = `<circle cx="${MATRIX_ORIGIN.x}" cy="${MATRIX_ORIGIN.y}" r="${ring}" fill="none" stroke="${t.bezel}" stroke-width="2.8"/>`;
  const ticks = minors
    .map((age) => {
      const p = ageMarkPosition(age);
      const outer = {
        x: p.x + (p.x - MATRIX_ORIGIN.x) * 0.028,
        y: p.y + (p.y - MATRIX_ORIGIN.y) * 0.028,
      };
      const inner = {
        x: p.x - (p.x - MATRIX_ORIGIN.x) * 0.028,
        y: p.y - (p.y - MATRIX_ORIGIN.y) * 0.028,
      };
      return `<line data-age-tick="${age}" x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}" stroke="${t.bezel}" stroke-width="1.4" stroke-linecap="round"/>`;
    })
    .join("");
  const beads = majors
    .map((age) => {
      const p = ageMarkPosition(age);
      return `<g data-age="${age}">
        <circle cx="${p.x}" cy="${p.y}" r="${beadR}" fill="${t.beadFill}" stroke="${t.beadStroke}" stroke-width="1.4"/>
        <text x="${p.x}" y="${p.y + 1}" text-anchor="middle" dominant-baseline="central" font-size="${type.ageMajor}" fill="${t.ageMajor}" font-family="${FONT}">${age}</text>
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
    `<line x1="${L.x}" y1="${L.y}" x2="${R.x}" y2="${R.y}" stroke="${t.axis}" stroke-width="1.35"/>`,
    `<line x1="${T.x}" y1="${T.y}" x2="${B.x}" y2="${B.y}" stroke="${t.axis}" stroke-width="1.35"/>`,
  ].join("");
}

function channels(t: ThemeTokens): string {
  return [
    `<polyline fill="none" stroke="${t.love}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(MATRIX_CHANNEL_PATHS.love)}"/>`,
    `<polyline fill="none" stroke="${t.money}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(MATRIX_CHANNEL_PATHS.money)}"/>`,
  ].join("");
}

function generation(t: ThemeTokens): string {
  const female = sampleArc(38, 142, GENERATION_RIBBON_RADIUS, 16);
  const male = sampleArc(178, 252, GENERATION_RIBBON_RADIUS, 14);
  return [
    `<polyline fill="none" stroke="${t.female}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" points="${pts(female)}"/>`,
    `<polyline fill="none" stroke="${t.male}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" points="${pts(male)}"/>`,
  ].join("");
}

function tailSpine(t: ThemeTokens): string {
  return `<polyline fill="none" stroke="${t.tail}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" points="${polylineFor(MATRIX_CHANNEL_PATHS.karmicTail)}"/>`;
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
  if (node.id === "outer.topRight" || node.id === "outer.topLeft") {
    return {
      fill: t.nodeFill,
      stroke: focused ? t.nodeStrokeCenter : t.female,
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
          ? [
              `<circle cx="${p.x}" cy="${p.y}" r="${CENTER_HALO_RADIUS}" fill="none" stroke="${t.halo}" stroke-width="10"/>`,
              `<circle cx="${p.x}" cy="${p.y}" r="${CENTER_CORE_RADIUS + 10}" fill="${t.core}"/>`,
            ].join("")
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
      return `<text data-value="${n.id}" x="${p.x}" y="${p.y + 1}" text-anchor="middle" dominant-baseline="central" font-size="${look.numSize}" font-weight="700" fill="${look.num}" font-family="${FONT}" opacity="${visible(n, revealed) ? 1 : 0}">${n.number}</text>`;
    })
    .join("");
}

function markers(t: ThemeTokens): string {
  const left = MATRIX_NODE_LAYOUT["outer.left"];
  const love = MATRIX_NODE_LAYOUT["horizontal.left"];
  const money = MATRIX_NODE_LAYOUT["horizontal.right"];
  const right = MATRIX_NODE_LAYOUT["outer.right"];
  const heart = { x: (left.x + love.x) / 2, y: left.y - 20 };
  const cash = { x: (money.x + right.x) / 2, y: right.y - 20 };
  return [
    `<text x="${heart.x}" y="${heart.y}" text-anchor="middle" font-size="15" fill="${t.love}" font-family="${FONT}">♥</text>`,
    `<text x="${cash.x}" y="${cash.y}" text-anchor="middle" font-size="15" fill="${t.money}" font-family="${FONT}">$</text>`,
  ].join("");
}

function zoneLabels(t: ThemeTokens, compact: boolean, type: TypeScale): string {
  if (compact) return "";
  const left = MATRIX_NODE_LAYOUT["outer.left"];
  const right = MATRIX_NODE_LAYOUT["outer.right"];
  const age20 = ageMarkPosition(20);
  const femaleLabel = polar(410, 105);
  const maleLabel = polar(418, 218);
  const bottom = MATRIX_NODE_LAYOUT["outer.bottom"];
  const tip = MATRIX_NODE_LAYOUT["karmicTail.tip"];
  return [
    `<text x="${left.x}" y="${left.y - 54}" text-anchor="middle" font-size="${type.zone}" fill="${t.label}" font-family="${FONT}">Характер</text>`,
    `<text x="${age20.x + 46}" y="${age20.y + 6}" text-anchor="start" font-size="${type.zone}" fill="${t.label}" font-family="${FONT}">Небо</text>`,
    `<text x="${right.x}" y="${right.y - 54}" text-anchor="middle" font-size="${type.zone}" fill="${t.label}" font-family="${FONT}">Материя</text>`,
    `<text x="${femaleLabel.x}" y="${femaleLabel.y}" text-anchor="middle" font-size="${type.helper}" fill="${t.female}" font-family="${FONT}">♀ линия</text>`,
    `<text x="${maleLabel.x}" y="${maleLabel.y}" text-anchor="middle" font-size="${type.helper}" fill="${t.male}" font-family="${FONT}">♂ линия</text>`,
    `<text x="${tip.x + 64}" y="${(bottom.y + tip.y) / 2 + 4}" text-anchor="start" font-size="${type.helper}" fill="${t.tail}" font-family="${FONT}">Кармический хвост</text>`,
  ].join("");
}


function periodLayer(
  model: MatrixSemanticModel,
  t: ThemeTokens,
  revealed: number,
  type: TypeScale
): string {
  return model.nodes
    .filter((n) => n.id === "period.year" || n.id === "period.month")
    .map((n) => {
      const p = layoutPoint(n.id);
      return `<g data-node="${n.id}" opacity="${visible(n, revealed) ? 1 : 0}">
        <text x="${p.x}" y="${p.y - 10}" text-anchor="middle" font-size="${type.helper}" fill="${t.muted}" font-family="${FONT}">${esc(n.label)}</text>
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
  const type = typeScale(compact);
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
  ${showAge ? `<g data-layer="age-scale">${ageScale(t, compact, type)}</g>` : ""}
  <g data-layer="structural-axes">${axes(t)}</g>
  <g data-layer="semantic-channels">${channels(t)}</g>
  <g data-layer="generation-lines">${generation(t)}</g>
  <g data-layer="secondary-connections">${tailSpine(t)}</g>
  <g data-layer="nodes">${nodesLayer(model, t, revealed, focusKey, type)}</g>
  <g data-layer="node-values">${valuesLayer(model, t, revealed, focusKey, type)}</g>
  <g data-layer="markers">${markers(t)}</g>
  <g data-layer="labels">${zoneLabels(t, compact, type)}</g>
  ${showPeriod ? `<g data-layer="period">${periodLayer(model, t, revealed, type)}</g>` : ""}
  <g data-layer="interactive"></g>`;

  if (options.fragment) {
    return `<g class="destiny-matrix-svg">${body}</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${matrixViewBoxAttr(compact)}" role="img" aria-labelledby="${uid}-title" class="destiny-matrix-svg">
  ${body}
</svg>`;
}

export function buildMatrixDiagramSvgFromResult(
  matrix: DestinyMatrixResult,
  options?: MatrixDiagramSvgOptions
): string {
  return buildMatrixDiagramSvg(buildMatrixSemanticModel(matrix), options);
}
