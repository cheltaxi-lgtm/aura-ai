import sharp from "sharp";
import { BOT_CANVAS_HEIGHT, BOT_CANVAS_WIDTH, encodeBotJpeg } from "./canvas.js";

export type MatrixDiagramSlot = {
  key: string;
  label: string;
  area: string;
  featured: boolean;
  number: number;
  arcanaName: string;
};

export type MatrixDiagramInput = {
  name?: string | null;
  birthDate?: string | null;
  slots: MatrixDiagramSlot[];
  /** Slot key to highlight as period focus (matrix-v2). */
  focusKey?: string | null;
  /** Canonical site SVG — preferred over the local octagram fallback. */
  svg?: string | null;
};

const FONT = "DejaVu Serif, Georgia, 'Times New Roman', serif";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleCaseName(raw: string): string {
  return raw
    .trim()
    .split(/[\s-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatBirthDate(raw: string): string {
  const d = raw.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y}`;
  }
  return raw.trim();
}

/** Must stay equal to site `matrix-layout.ts` (verify-matrix-layout-drift). */
const CX = 500;
const CY = 478;
const R = 376;
const INNER = R * 0.5;
const DEG = Math.PI / 180;

function polar(radius: number, angleDeg: number): { x: number; y: number } {
  const a = angleDeg * DEG;
  return {
    x: Math.round((CX + radius * Math.cos(a)) * 100) / 100,
    y: Math.round((CY - radius * Math.sin(a)) * 100) / 100,
  };
}

const SLOT_POS: Record<string, { x: number; y: number; r: number }> = {
  body: { ...polar(R, 180), r: 28 },
  talents: { ...polar(R, 135), r: 24 },
  energy: { ...polar(R, 90), r: 28 },
  maternal: { ...polar(R, 45), r: 24 },
  roots: { ...polar(R, 0), r: 28 },
  karma: { ...polar(R, -90), r: 28 },
  purpose: { x: CX, y: CY, r: 40 },
  comfort: { x: CX, y: CY, r: 40 },
  skySpirit: { ...polar(INNER, 90), r: 20 },
  karmicMid: { ...polar(INNER, -90), r: 20 },
  relationships: { ...polar(INNER, 180), r: 20 },
  money: { ...polar(INNER, 0), r: 20 },
  paternal: {
    x: Math.round((polar(R, 180).x + (polar(R, -45).x - polar(R, 180).x) * 0.34) * 100) / 100,
    y: Math.round((polar(R, 180).y + (polar(R, -45).y - polar(R, 180).y) * 0.34) * 100) / 100,
    r: 26,
  },
  karmicTip: { x: CX, y: Math.round((polar(R, -90).y + 96) * 100) / 100, r: 28 },
};

function fallbackOctagram(slots: MatrixDiagramSlot[], focusKey: string): string {
  const byKey = new Map(slots.map((s) => [s.key, s]));
  const diamond = [180, 90, 0, -90].map((a) => polar(R, a));
  const square = [135, 45, -45, -135].map((a) => polar(R, a));
  const poly = (pts: Array<{ x: number; y: number }>) =>
    pts.map((p) => `${p.x},${p.y}`).join(" ");

  const nodes = Object.entries(SLOT_POS)
    .map(([key, pos]) => {
      const slot = byKey.get(key);
      if (!slot) return "";
      const focus = focusKey && slot.key === focusKey;
      const featured = slot.featured || key === "comfort" || key === "purpose" || focus;
      const stroke = focus ? "#e8c77e" : featured ? "rgba(201,162,74,0.78)" : "rgba(237,230,218,0.38)";
      const fill = focus ? "#241c12" : featured ? "#1c1914" : "#141210";
      const num = slot.number > 9 ? 22 : 24;
      return `<g>
        <circle cx="${pos.x}" cy="${pos.y}" r="${pos.r}" fill="${fill}" stroke="${stroke}" stroke-width="${featured ? 2.2 : 1.35}"/>
        <text x="${pos.x}" y="${pos.y + 1}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="${key === "comfort" || key === "purpose" ? 34 : num}" font-weight="700" fill="#ede6da">${slot.number}</text>
      </g>`;
    })
    .join("");

  return `<svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
    <rect width="1000" height="1000" fill="#0a0908"/>
    <polygon fill="none" stroke="rgba(237,230,218,0.42)" stroke-width="1.7" points="${poly(diamond)}"/>
    <polygon fill="none" stroke="rgba(201,162,74,0.34)" stroke-width="1.5" points="${poly(square)}"/>
    <line x1="${polar(R, 180).x}" y1="${polar(R, 180).y}" x2="${polar(R, 0).x}" y2="${polar(R, 0).y}" stroke="rgba(237,230,218,0.22)" stroke-width="1.15"/>
    <line x1="${polar(R, 90).x}" y1="${polar(R, 90).y}" x2="${polar(R, -90).x}" y2="${polar(R, -90).y}" stroke="rgba(237,230,218,0.22)" stroke-width="1.15"/>
    ${nodes}
  </svg>`;
}

function embedDiagram(svg: string): string {
  const trimmed = svg.trim();
  if (trimmed.startsWith("<svg")) return trimmed;
  return `<svg viewBox="0 0 1000 1064" xmlns="http://www.w3.org/2000/svg">${trimmed}</svg>`;
}

/**
 * Destiny-matrix diagram — native 1080×1350, canonical octagram.
 */
export async function renderMatrixDiagramImage(input: MatrixDiagramInput): Promise<Buffer> {
  const width = BOT_CANVAS_WIDTH;
  const height = BOT_CANVAS_HEIGHT;
  const name = input.name?.trim() ? titleCaseName(input.name) : "";
  const birth = input.birthDate?.trim() ? formatBirthDate(input.birthDate) : "";
  const subtitle = [name || null, birth || null].filter(Boolean).join("  ·  ");
  const focusKey = input.focusKey?.trim() || "";
  const inner = input.svg?.trim()
    ? embedDiagram(input.svg)
    : fallbackOctagram(input.slots, focusKey);

  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0a0908"/>
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="26" fill="none" stroke="rgba(201,162,74,0.22)" stroke-width="1"/>
  <text x="50%" y="72" text-anchor="middle" font-family="${FONT}" font-size="18" letter-spacing="5" fill="#C9A24A">ZOVUS</text>
  <text x="50%" y="118" text-anchor="middle" font-family="${FONT}" font-size="36" fill="#EDE6DA">Матрица судьбы</text>
  ${
    subtitle
      ? `<text x="50%" y="156" text-anchor="middle" font-family="${FONT}" font-size="20" fill="rgba(232,196,120,0.9)">${escapeXml(subtitle)}</text>`
      : ""
  }
  <svg x="40" y="176" width="1000" height="1100" viewBox="0 0 1000 1064">
    ${inner}
  </svg>
  <text x="50%" y="${height - 38}" text-anchor="middle" font-family="${FONT}" font-size="15" fill="rgba(237,230,218,0.36)">22 аркана · схема по дате рождения · zovus.ru</text>
</svg>`);

  return encodeBotJpeg(sharp(svg));
}
