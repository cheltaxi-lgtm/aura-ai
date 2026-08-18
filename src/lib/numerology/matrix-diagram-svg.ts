/**
 * Canonical Destiny Matrix SVG. Used by web, print, share, and Telegram.
 * Numbers come from the semantic model; coordinates come from matrix-layout.
 */
import {
  ANCESTRAL_SQUARE_IDS,
  MATRIX_CHANNEL_PATHS,
  MATRIX_NODE_LAYOUT,
  MATRIX_NODE_RADIUS,
  MATRIX_VIEWBOX,
  PERSONAL_DIAMOND_IDS,
  ageMarkPosition,
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
  /** Hide year/month chips (thumbnails). */
  showPeriod?: boolean;
  showAgeMarks?: boolean;
  showChannelMarks?: boolean;
  uid?: string;
  /** Inner markup only — for embedding into a parent SVG. */
  fragment?: boolean;
};

type ThemeTokens = {
  bg: string;
  frame: string;
  diamond: string;
  square: string;
  axis: string;
  love: string;
  money: string;
  male: string;
  female: string;
  tail: string;
  nodeFill: string;
  nodeStroke: string;
  nodeFillFeatured: string;
  nodeStrokeFeatured: string;
  nodeFillFocus: string;
  nodeStrokeFocus: string;
  number: string;
  numberFeatured: string;
  label: string;
  age: string;
  ageCurrent: string;
  muted: string;
};

const DARK: ThemeTokens = {
  bg: "#0a0908",
  frame: "rgba(201,162,74,0.16)",
  diamond: "rgba(237,230,218,0.42)",
  square: "rgba(201,162,74,0.34)",
  axis: "rgba(237,230,218,0.22)",
  love: "rgba(196,140,148,0.55)",
  money: "rgba(201,162,74,0.55)",
  male: "rgba(130,154,176,0.58)",
  female: "rgba(176,142,168,0.58)",
  tail: "rgba(168,120,72,0.7)",
  nodeFill: "#141210",
  nodeStroke: "rgba(237,230,218,0.38)",
  nodeFillFeatured: "#1c1914",
  nodeStrokeFeatured: "rgba(201,162,74,0.78)",
  nodeFillFocus: "#241c12",
  nodeStrokeFocus: "#e8c77e",
  number: "#ede6da",
  numberFeatured: "#fff6e0",
  label: "rgba(237,230,218,0.62)",
  age: "rgba(237,230,218,0.48)",
  ageCurrent: "#e8c77e",
  muted: "rgba(237,230,218,0.38)",
};

const PRINT: ThemeTokens = {
  bg: "#ffffff",
  frame: "rgba(26,24,22,0.12)",
  diamond: "rgba(26,24,22,0.55)",
  square: "rgba(138,109,47,0.55)",
  axis: "rgba(26,24,22,0.28)",
  love: "rgba(128,72,80,0.7)",
  money: "rgba(138,109,47,0.75)",
  male: "rgba(56,80,104,0.7)",
  female: "rgba(104,64,96,0.7)",
  tail: "rgba(112,72,32,0.8)",
  nodeFill: "#ffffff",
  nodeStroke: "rgba(26,24,22,0.55)",
  nodeFillFeatured: "#f7f1e4",
  nodeStrokeFeatured: "#8a6d2f",
  nodeFillFocus: "#f3e6c8",
  nodeStrokeFocus: "#6f5418",
  number: "#1a1816",
  numberFeatured: "#1a1816",
  label: "rgba(26,24,22,0.62)",
  age: "rgba(26,24,22,0.5)",
  ageCurrent: "#6f5418",
  muted: "rgba(26,24,22,0.45)",
};

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

function nodeFill(node: MatrixSemanticNode, focused: boolean, t: ThemeTokens): string {
  if (focused) return t.nodeFillFocus;
  if (node.role === "center") return t.nodeFillFeatured;
  return t.nodeFill;
}

function nodeStroke(node: MatrixSemanticNode, focused: boolean, t: ThemeTokens): string {
  if (focused) return t.nodeStrokeFocus;
  if (node.role === "center") return t.nodeStrokeFeatured;
  return t.nodeStroke;
}

function labelOffset(id: MatrixLayoutId, r: number): { dx: number; dy: number; anchor: string } {
  switch (id) {
    case "outer.left":
      return { dx: -(r + 10), dy: -34, anchor: "end" };
    case "outer.right":
      return { dx: r + 10, dy: -34, anchor: "start" };
    case "outer.top":
      return { dx: 0, dy: -(r + 18), anchor: "middle" };
    case "outer.bottom":
      return { dx: 36, dy: r + 16, anchor: "start" };
    case "outer.topLeft":
      return { dx: -(r + 6), dy: -(r + 4), anchor: "end" };
    case "outer.topRight":
      return { dx: r + 6, dy: -(r + 4), anchor: "start" };
    case "outer.bottomRight":
      return { dx: r + 8, dy: r + 10, anchor: "start" };
    case "outer.bottomLeft":
      return { dx: -(r + 8), dy: r + 10, anchor: "end" };
    case "center":
      return { dx: 0, dy: r + 22, anchor: "middle" };
    case "karmicTail.tip":
      return { dx: 28, dy: 6, anchor: "start" };
    case "maleLine.head":
      return { dx: 22, dy: 28, anchor: "start" };
    case "horizontal.left":
      return { dx: 0, dy: -28, anchor: "middle" };
    case "horizontal.right":
      return { dx: 0, dy: -28, anchor: "middle" };
    case "vertical.top":
      return { dx: 28, dy: 4, anchor: "start" };
    case "vertical.bottom":
      return { dx: 28, dy: 4, anchor: "start" };
    default:
      return { dx: 0, dy: r + 18, anchor: "middle" };
  }
}

function channelLayer(t: ThemeTokens): string {
  const line = (
    id: keyof typeof MATRIX_CHANNEL_PATHS,
    color: string,
    width: number,
    dash?: string
  ) =>
    `<polyline fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${
      dash ? ` stroke-dasharray="${dash}"` : ""
    } points="${polylineFor(MATRIX_CHANNEL_PATHS[id])}"/>`;

  return [
    line("skyEarth", t.axis, 1.4),
    line("love", t.love, 2),
    line("money", t.money, 1.7, "5 6"),
    line("male", t.male, 1.8),
    line("female", t.female, 1.8),
    line("karmicTail", t.tail, 2.1),
  ].join("");
}

function geometryLayer(t: ThemeTokens): string {
  return [
    `<polygon fill="none" stroke="${t.diamond}" stroke-width="1.7" points="${polylineFor(PERSONAL_DIAMOND_IDS)}"/>`,
    `<polygon fill="none" stroke="${t.square}" stroke-width="1.5" points="${polylineFor(ANCESTRAL_SQUARE_IDS)}"/>`,
    `<line x1="${MATRIX_NODE_LAYOUT["outer.left"].x}" y1="${MATRIX_NODE_LAYOUT["outer.left"].y}" x2="${MATRIX_NODE_LAYOUT["outer.right"].x}" y2="${MATRIX_NODE_LAYOUT["outer.right"].y}" stroke="${t.axis}" stroke-width="1.15"/>`,
    `<line x1="${MATRIX_NODE_LAYOUT["outer.top"].x}" y1="${MATRIX_NODE_LAYOUT["outer.top"].y}" x2="${MATRIX_NODE_LAYOUT["outer.bottom"].x}" y2="${MATRIX_NODE_LAYOUT["outer.bottom"].y}" stroke="${t.axis}" stroke-width="1.15"/>`,
  ].join("");
}

function ageLayer(model: MatrixSemanticModel, t: ThemeTokens, compact: boolean): string {
  return model.ageMarks
    .filter((mark) => !compact || mark.age % 20 === 0 || mark.current)
    .map((mark) => {
      const p = ageMarkPosition(mark.age);
      const fill = mark.current ? t.ageCurrent : t.age;
      const size = mark.current ? 20 : 16;
      return `<text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="middle" font-size="${size}" fill="${fill}" font-family="Georgia, 'Times New Roman', serif">${mark.age}</text>`;
    })
    .join("");
}

function nodesLayer(
  model: MatrixSemanticModel,
  t: ThemeTokens,
  revealed: number,
  focusKey: string,
  compact: boolean
): string {
  const skip = new Set<MatrixLayoutId>(["period.year", "period.month"]);
  return model.nodes
    .filter((n) => !skip.has(n.id))
    .map((n) => {
      const p = layoutPoint(n.id);
      const r = MATRIX_NODE_RADIUS[n.id];
      const focused = isNodeFocused(n, focusKey);
      const shown = visible(n, revealed);
      const opacity = shown ? 1 : 0;
      const fill = nodeFill(n, focused, t);
      const stroke = nodeStroke(n, focused, t);
      const sw = n.role === "center" || focused ? 2.2 : 1.35;
      const numSize = n.role === "center" ? 34 : n.number > 9 ? 22 : 24;
      const numFill = n.role === "center" || focused ? t.numberFeatured : t.number;
      const off = labelOffset(n.id, r);
      const label =
        compact || n.role === "axis"
          ? ""
          : `<text x="${p.x + off.dx}" y="${p.y + off.dy}" text-anchor="${off.anchor}" font-size="15" fill="${t.label}" font-family="Georgia, 'Times New Roman', serif">${esc(n.shortLabel)}</text>`;
      const heart =
        n.id === "horizontal.left"
          ? `<text x="${p.x}" y="${p.y + r + 16}" text-anchor="middle" font-size="11" fill="${t.love}" opacity="0.85">♡</text>`
          : "";
      const cash =
        n.id === "horizontal.right"
          ? `<text x="${p.x}" y="${p.y + r + 16}" text-anchor="middle" font-size="11" fill="${t.money}" opacity="0.85">$</text>`
          : "";
      return `<g data-node="${n.id}" opacity="${opacity}">
        <circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
        <text x="${p.x}" y="${p.y + 1}" text-anchor="middle" dominant-baseline="central" font-size="${numSize}" font-weight="700" fill="${numFill}" font-family="Georgia, 'Times New Roman', serif">${n.number}</text>
        ${label}${heart}${cash}
      </g>`;
    })
    .join("");
}

function periodLayer(
  model: MatrixSemanticModel,
  t: ThemeTokens,
  revealed: number,
  focusKey: string
): string {
  return model.nodes
    .filter((n) => n.id === "period.year" || n.id === "period.month")
    .map((n) => {
      const p = layoutPoint(n.id);
      const focused = isNodeFocused(n, focusKey);
      const shown = visible(n, revealed);
      const fill = focused ? t.nodeFillFocus : t.nodeFill;
      const stroke = focused ? t.nodeStrokeFocus : t.nodeStroke;
      return `<g data-node="${n.id}" opacity="${shown ? 1 : 0}">
        <rect x="${p.x - 86}" y="${p.y - 28}" width="172" height="56" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>
        <text x="${p.x}" y="${p.y - 8}" text-anchor="middle" font-size="13" fill="${t.label}" font-family="Georgia, 'Times New Roman', serif">${esc(n.label)}</text>
        <text x="${p.x}" y="${p.y + 14}" text-anchor="middle" font-size="20" font-weight="700" fill="${t.number}" font-family="Georgia, 'Times New Roman', serif">${n.number} · ${esc(n.arcanaName)}</text>
      </g>`;
    })
    .join("");
}

function legend(t: ThemeTokens, compact: boolean): string {
  if (compact) return "";
  const items: Array<[string, string]> = [
    [t.male, "Мужская линия"],
    [t.female, "Женская линия"],
    [t.money, "Деньги"],
    [t.love, "Отношения"],
    [t.tail, "Кармический хвост"],
  ];
  return items
    .map(([color, label], i) => {
      const x = 90 + i * 170;
      return `<g>
        <line x1="${x}" y1="1004" x2="${x + 18}" y2="1004" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
        <text x="${x + 24}" y="1008" font-size="13" fill="${t.muted}" font-family="Georgia, 'Times New Roman', serif">${esc(label)}</text>
      </g>`;
    })
    .join("");
}

function a11yList(model: MatrixSemanticModel): string {
  const items = model.nodes
    .map((n) => `${n.label}: ${n.number} ${n.arcanaName}`)
    .join("; ");
  return `<desc>${esc(items)}</desc>`;
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
  <rect x="28" y="20" width="944" height="1160" rx="28" fill="none" stroke="${t.frame}" stroke-width="1"/>
  <g data-layer="geometry">${geometryLayer(t)}</g>
  <g data-layer="channels">${channelLayer(t)}</g>
  <g data-layer="nodes">${nodesLayer(model, t, revealed, focusKey, compact)}</g>
  ${showAge ? `<g data-layer="ages">${ageLayer(model, t, compact)}</g>` : ""}
  ${showPeriod ? `<g data-layer="period">${periodLayer(model, t, revealed, focusKey)}</g>` : ""}
  ${options.showChannelMarks === false ? "" : `<g data-layer="legend">${legend(t, compact)}</g>`}`;

  if (options.fragment) {
    return `<g class="destiny-matrix-svg">${body}</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MATRIX_VIEWBOX.width} ${MATRIX_VIEWBOX.height}" role="img" aria-labelledby="${uid}-title" class="destiny-matrix-svg">
  ${body}
</svg>`;
}

export function buildMatrixDiagramSvgFromResult(
  matrix: DestinyMatrixResult,
  options?: MatrixDiagramSvgOptions
): string {
  return buildMatrixDiagramSvg(buildMatrixSemanticModel(matrix), options);
}
