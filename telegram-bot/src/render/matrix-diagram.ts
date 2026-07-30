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
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapWords(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = w;
    if (lines.length >= maxLines - 1) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]!;
    if (last.length > maxChars) lines[maxLines - 1] = `${last.slice(0, maxChars - 1)}…`;
  }
  return lines;
}

/** Grid areas matching site DestinyMatrixGrid (desktop cross). */
const AREA_POS: Record<string, { col: number; row: number }> = {
  energy: { col: 1, row: 0 },
  body: { col: 0, row: 1 },
  purpose: { col: 1, row: 1 },
  roots: { col: 2, row: 1 },
  talents: { col: 0, row: 2 },
  money: { col: 1, row: 2 },
  rel: { col: 2, row: 2 },
  paternal: { col: 0, row: 3 },
  maternal: { col: 1, row: 3 },
  karma: { col: 2, row: 3 },
  year: { col: 1, row: 4 },
};

/**
 * Premium destiny-matrix diagram (site-parity cross grid) → JPEG for Telegram.
 */
export async function renderMatrixDiagramImage(input: MatrixDiagramInput): Promise<Buffer> {
  const width = 1080;
  const padX = 48;
  const padTop = 110;
  const padBottom = 72;
  const gap = 18;
  const cols = 3;
  const rows = 5;
  const cellW = Math.floor((width - padX * 2 - gap * (cols - 1)) / cols);
  const cellH = 148;
  const height = padTop + rows * cellH + gap * (rows - 1) + padBottom;

  const title = "Матрица судьбы";
  const subtitleParts = [
    input.name?.trim() || null,
    input.birthDate?.trim() || null,
  ].filter(Boolean);
  const subtitle = subtitleParts.join(" · ");

  const cells = input.slots
    .map((slot) => {
      const pos = AREA_POS[slot.area];
      if (!pos) return "";
      const x = padX + pos.col * (cellW + gap);
      const y = padTop + pos.row * (cellH + gap);
      const featured = slot.featured;
      const fill = featured ? "url(#cellGold)" : "url(#cellViolet)";
      const stroke = featured ? "rgba(212,175,90,0.55)" : "rgba(196,160,255,0.32)";
      const labelFill = featured ? "rgba(212,175,90,0.9)" : "rgba(196,160,255,0.72)";
      const numFill = featured ? "#FFF6E0" : "#F8F2FF";
      const nameLines = wrapWords(slot.arcanaName || `Аркан ${slot.number}`, 16, 2);
      const nameSvg = nameLines
        .map(
          (line, i) =>
            `<text x="${x + cellW / 2}" y="${y + 112 + i * 18}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="15" fill="rgba(255,255,255,0.78)">${escapeXml(line)}</text>`
        )
        .join("");

      return `
        <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="22" ry="22" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
        <text x="${x + cellW / 2}" y="${y + 28}" text-anchor="middle" font-family="Georgia, serif" font-size="12" letter-spacing="2" fill="${labelFill}">${escapeXml(slot.label.toUpperCase())}</text>
        <text x="${x + cellW / 2}" y="${y + 78}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${featured ? 48 : 42}" font-weight="700" fill="${numFill}">${slot.number}</text>
        ${nameSvg}
      `;
    })
    .join("");

  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="28%" r="78%">
      <stop offset="0%" stop-color="#2A1848"/>
      <stop offset="55%" stop-color="#140F24"/>
      <stop offset="100%" stop-color="#080612"/>
    </radialGradient>
    <linearGradient id="cellViolet" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(56,34,88,0.92)"/>
      <stop offset="100%" stop-color="rgba(14,10,28,0.88)"/>
    </linearGradient>
    <linearGradient id="cellGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(72,48,22,0.92)"/>
      <stop offset="100%" stop-color="rgba(36,22,56,0.9)"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="10" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="28" ry="28" fill="none" stroke="rgba(196,160,255,0.22)" stroke-width="1"/>
  <circle cx="${width / 2}" cy="210" r="220" fill="rgba(196,160,255,0.06)" filter="url(#glow)"/>
  <text x="50%" y="52" text-anchor="middle" font-family="Georgia, serif" font-size="20" letter-spacing="4" fill="#C9A24A">ZOVUS</text>
  <text x="50%" y="86" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="#F8F2FF">${escapeXml(title)}</text>
  ${
    subtitle
      ? `<text x="50%" y="112" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="rgba(212,175,90,0.85)">${escapeXml(subtitle)}</text>`
      : ""
  }
  ${cells}
  <text x="50%" y="${height - 34}" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="rgba(255,255,255,0.38)">22 аркана · схема по дате рождения · zovus.ru</text>
</svg>`);

  return encodeBotJpeg(
    sharp(svg).resize(BOT_CANVAS_WIDTH, BOT_CANVAS_HEIGHT, {
      fit: "contain",
      background: { r: 14, g: 12, b: 11, alpha: 1 },
      withoutEnlargement: false,
    })
  );
}
