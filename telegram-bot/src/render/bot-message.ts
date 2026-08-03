import sharp from "sharp";
import {
  BOT_CANVAS_HEIGHT,
  BOT_CANVAS_WIDTH,
  encodeBotJpeg,
} from "./canvas.js";
import { htmlReadingToPlain } from "./reading-page.js";

/** @deprecated use BOT_CANVAS_WIDTH */
export const BOT_MESSAGE_WIDTH = BOT_CANVAS_WIDTH;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapLine(text: string, maxChars: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    if (w.length <= maxChars) cur = w;
    else {
      for (let i = 0; i < w.length; i += maxChars) {
        const chunk = w.slice(i, i + maxChars);
        if (i + maxChars < w.length) lines.push(chunk);
        else cur = chunk;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function wrapParagraphs(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    out.push(...wrapLine(para, maxChars));
  }
  return out;
}

/**
 * Render any bot text as a full-width (1080) JPEG so Telegram bubbles match media.
 */
export async function renderBotMessageImage(
  text: string,
  opts?: { brand?: string; showBrand?: boolean }
): Promise<Buffer> {
  const width = BOT_CANVAS_WIDTH;
  const height = BOT_CANVAS_HEIGHT;
  const padX = 56;
  const lineH = 36;
  const bodySize = 28;
  const maxChars = 40;
  const maxLines = 28;
  const showBrand = opts?.showBrand !== false;

  let plain = htmlReadingToPlain(text || "")
    .replace(/\u2800+/g, "")
    .replace(/\u3164+/g, "")
    .trim();
  if (!plain) plain = "—";

  const rawLines = wrapParagraphs(plain, maxChars);
  const clipped = rawLines.length > maxLines;
  const drawLines = clipped ? [...rawLines.slice(0, maxLines - 1), "…"] : rawLines;

  const brandH = showBrand ? 40 : 0;
  const contentH = drawLines.reduce(
    (h, line) => h + (line ? lineH : lineH * 0.5),
    0
  );
  const blockH = brandH + contentH;
  let y = Math.floor((height - blockH) / 2) + (showBrand ? 22 : 0);

  const nodes: string[] = [];
  if (showBrand) {
    nodes.push(
      `<text x="50%" y="${y}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="20" fill="#C4A574">${escapeXml(opts?.brand || "Zovus")}</text>`
    );
    y += 36;
  }

  for (const line of drawLines) {
    if (!line) {
      y += lineH * 0.5;
      continue;
    }
    nodes.push(
      `<text x="${padX}" y="${y}" font-family="Georgia, 'Times New Roman', serif" font-size="${bodySize}" fill="#F2E8D8">${escapeXml(line)}</text>`
    );
    y += lineH;
  }

  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bg" cx="50%" cy="25%" r="80%">
          <stop offset="0%" stop-color="#241C18"/>
          <stop offset="100%" stop-color="#0E0C0B"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect x="18" y="18" width="${width - 36}" height="${height - 36}" fill="none" stroke="#C4A574" stroke-opacity="0.35" stroke-width="1"/>
      ${nodes.join("\n")}
    </svg>`
  );

  return encodeBotJpeg(sharp(svg));
}
