import sharp from "sharp";
import { BOT_CANVAS_HEIGHT, BOT_CANVAS_WIDTH, encodeBotJpeg } from "./canvas.js";

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

export type MatrixShareCardInput = {
  focusLabel: string;
  focusTitle: string;
  focusNumber: number;
  practice: string;
  name?: string | null;
};

/** Compact share card: one zone + practice (1080×1350). */
export async function renderMatrixShareCardImage(input: MatrixShareCardInput): Promise<Buffer> {
  const width = BOT_CANVAS_WIDTH;
  const height = BOT_CANVAS_HEIGHT;
  const practiceLines = wrapWords(input.practice || "Одно маленькое действие по зоне.", 34, 5);
  const practiceSvg = practiceLines
    .map(
      (line, i) =>
        `<text x="50%" y="${720 + i * 42}" text-anchor="middle" font-family="${FONT}" font-size="28" fill="rgba(255,255,255,0.82)">${escapeXml(line)}</text>`
    )
    .join("");
  const nameLine = input.name?.trim()
    ? `<text x="50%" y="210" text-anchor="middle" font-family="${FONT}" font-size="22" fill="rgba(232,196,120,0.85)">${escapeXml(input.name.trim())}</text>`
    : "";

  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="28%" r="80%">
      <stop offset="0%" stop-color="#2C1A4A"/>
      <stop offset="55%" stop-color="#151028"/>
      <stop offset="100%" stop-color="#080612"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="40" y="40" width="${width - 80}" height="${height - 80}" rx="28" fill="none" stroke="rgba(201,162,74,0.28)" stroke-width="1.5"/>
  <text x="50%" y="110" text-anchor="middle" font-family="${FONT}" font-size="18" letter-spacing="5" fill="#C9A24A">ZOVUS</text>
  <text x="50%" y="170" text-anchor="middle" font-family="${FONT}" font-size="34" fill="#F8F2FF">Узел периода</text>
  ${nameLine}
  <text x="50%" y="320" text-anchor="middle" font-family="${FONT}" font-size="24" fill="rgba(196,160,255,0.85)">${escapeXml(input.focusLabel.toUpperCase())}</text>
  <text x="50%" y="460" text-anchor="middle" font-family="${FONT}" font-size="120" font-weight="700" fill="#FFF6E0">${input.focusNumber}</text>
  <text x="50%" y="540" text-anchor="middle" font-family="${FONT}" font-size="40" fill="#F8F2FF">${escapeXml(input.focusTitle)}</text>
  <line x1="180" y1="600" x2="${width - 180}" y2="600" stroke="rgba(196,160,255,0.22)" stroke-width="1"/>
  <text x="50%" y="660" text-anchor="middle" font-family="${FONT}" font-size="18" letter-spacing="2" fill="rgba(232,196,120,0.8)">ПРАКТИКА НА 7 ДНЕЙ</text>
  ${practiceSvg}
  <text x="50%" y="${height - 70}" text-anchor="middle" font-family="${FONT}" font-size="16" fill="rgba(255,255,255,0.35)">полная матрица · ведение в Telegram · zovus.ru</text>
</svg>`);

  return encodeBotJpeg(sharp(svg));
}
