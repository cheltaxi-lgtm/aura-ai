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
};

const FONT = "DejaVu Serif, Georgia, 'Times New Roman', serif";

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

/** Grid areas matching site DestinyMatrixGrid matrix-v2 (4×5). */
const AREA_POS: Record<string, { col: number; row: number }> = {
  energy: { col: 1, row: 0 },
  sky: { col: 2, row: 0 },
  body: { col: 0, row: 1 },
  purpose: { col: 1, row: 1 },
  roots: { col: 2, row: 1 },
  money: { col: 3, row: 1 },
  talents: { col: 0, row: 2 },
  rel: { col: 1, row: 2 },
  paternal: { col: 2, row: 2 },
  maternal: { col: 3, row: 2 },
  karma: { col: 0, row: 3 },
  tailMid: { col: 1, row: 3 },
  tailTip: { col: 2, row: 3 },
  age: { col: 3, row: 3 },
  year: { col: 1, row: 4 },
  month: { col: 2, row: 4 },
};

/**
 * Destiny-matrix diagram — native 1080×1350 (no letterbox), header clear of cells.
 */
export async function renderMatrixDiagramImage(input: MatrixDiagramInput): Promise<Buffer> {
  const width = BOT_CANVAS_WIDTH;
  const height = BOT_CANVAS_HEIGHT;

  const padX = 52;
  const headerBottom = 210; // grid starts below brand + title + subtitle
  const footerTop = height - 64;
  const gap = 16;
  const cols = 4;
  const rows = 5;
  const cellW = Math.floor((width - padX * 2 - gap * (cols - 1)) / cols);
  const cellH = Math.floor((footerTop - headerBottom - gap * (rows - 1)) / rows);

  const name = input.name?.trim() ? titleCaseName(input.name) : "";
  const birth = input.birthDate?.trim() ? formatBirthDate(input.birthDate) : "";
  const subtitle = [name || null, birth || null].filter(Boolean).join("  ·  ");

  const focusKey = input.focusKey?.trim() || "";
  const cells = input.slots
    .map((slot) => {
      const pos = AREA_POS[slot.area];
      if (!pos) return "";
      const x = padX + pos.col * (cellW + gap);
      const y = headerBottom + pos.row * (cellH + gap);
      const isFocus = Boolean(focusKey) && slot.key === focusKey;
      const featured = slot.featured || isFocus;
      const fill = isFocus
        ? "url(#cellFocus)"
        : featured
          ? "url(#cellGold)"
          : "url(#cellViolet)";
      const stroke = isFocus
        ? "rgba(255,214,120,0.95)"
        : featured
          ? "rgba(212,175,90,0.62)"
          : "rgba(196,160,255,0.28)";
      const strokeW = isFocus ? 3 : 1.5;
      const labelFill = featured || isFocus ? "rgba(232,196,120,0.95)" : "rgba(196,160,255,0.75)";
      const numFill = featured || isFocus ? "#FFF6E0" : "#F8F2FF";
      const numSize = featured || isFocus ? 52 : 46;
      const labelY = y + Math.round(cellH * 0.2);
      const numY = y + Math.round(cellH * 0.52);
      const nameStartY = y + Math.round(cellH * 0.72);
      const nameLines = wrapWords(slot.arcanaName || `Аркан ${slot.number}`, 15, 2);
      const nameSvg = nameLines
        .map(
          (line, i) =>
            `<text x="${x + cellW / 2}" y="${nameStartY + i * 20}" text-anchor="middle" font-family="${FONT}" font-size="16" fill="rgba(255,255,255,0.78)">${escapeXml(line)}</text>`
        )
        .join("");
      const focusBadge = isFocus
        ? `<text x="${x + cellW / 2}" y="${y + 14}" text-anchor="middle" font-family="${FONT}" font-size="11" letter-spacing="1.2" fill="rgba(255,214,120,0.95)">УЗЕЛ</text>`
        : "";

      return `
        <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="20" ry="20" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/>
        ${focusBadge}
        <text x="${x + cellW / 2}" y="${labelY}" text-anchor="middle" font-family="${FONT}" font-size="13" letter-spacing="1.6" fill="${labelFill}">${escapeXml(slot.label.toUpperCase())}</text>
        <text x="${x + cellW / 2}" y="${numY}" text-anchor="middle" font-family="${FONT}" font-size="${numSize}" font-weight="700" fill="${numFill}">${slot.number}</text>
        ${nameSvg}
      `;
    })
    .join("");

  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="22%" r="82%">
      <stop offset="0%" stop-color="#2C1A4A"/>
      <stop offset="48%" stop-color="#151028"/>
      <stop offset="100%" stop-color="#080612"/>
    </radialGradient>
    <linearGradient id="cellViolet" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(62,38,96,0.95)"/>
      <stop offset="100%" stop-color="rgba(16,12,30,0.92)"/>
    </linearGradient>
    <linearGradient id="cellGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(82,54,24,0.95)"/>
      <stop offset="100%" stop-color="rgba(40,24,58,0.92)"/>
    </linearGradient>
    <linearGradient id="cellFocus" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(110,72,18,0.98)"/>
      <stop offset="100%" stop-color="rgba(48,28,70,0.95)"/>
    </linearGradient>
    <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="18" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="${width / 2}" cy="280" r="260" fill="rgba(196,160,255,0.05)" filter="url(#softGlow)"/>
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="26" ry="26" fill="none" stroke="rgba(196,160,255,0.18)" stroke-width="1"/>
  <rect x="40" y="40" width="${width - 80}" height="${height - 80}" rx="20" ry="20" fill="none" stroke="rgba(201,162,74,0.14)" stroke-width="1"/>

  <text x="50%" y="72" text-anchor="middle" font-family="${FONT}" font-size="18" letter-spacing="5" fill="#C9A24A">ZOVUS</text>
  <text x="50%" y="122" text-anchor="middle" font-family="${FONT}" font-size="40" fill="#F8F2FF">Матрица судьбы</text>
  ${
    subtitle
      ? `<text x="50%" y="168" text-anchor="middle" font-family="${FONT}" font-size="20" fill="rgba(232,196,120,0.9)">${escapeXml(subtitle)}</text>`
      : ""
  }
  <line x1="${padX}" y1="188" x2="${width - padX}" y2="188" stroke="rgba(196,160,255,0.16)" stroke-width="1"/>

  ${cells}

  <text x="50%" y="${height - 38}" text-anchor="middle" font-family="${FONT}" font-size="15" fill="rgba(255,255,255,0.36)">22 аркана · схема по дате рождения · zovus.ru</text>
</svg>`);

  // Already native 1080×1350 — encode directly, no contain/letterbox.
  return encodeBotJpeg(sharp(svg));
}
