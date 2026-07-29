import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { botConfig } from "../config.js";
import { reportAssetMissing, resolveAssetPath } from "../domain/deck/asset-check.js";
import type { DrawnCard } from "../domain/deck/types.js";

const LONG = 1400;
const ASPECT = 4 / 5;
const WIDTH = Math.round(LONG * ASPECT); // vertical 4:5 → width < height; long side = height
const HEIGHT = LONG;

function resolveCardPath(slug: string): string | null {
  return resolveAssetPath(botConfig.deckAssetsDir, slug);
}

function resolveBackPath(): string | null {
  return resolveCardPath("_back");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cachePath(sessionId: string, stage: number): string {
  mkdirSync(botConfig.collageCacheDir, { recursive: true });
  return resolve(botConfig.collageCacheDir, `${sessionId}-s${stage}.jpg`);
}

export function readCachedCollage(sessionId: string, stage: number): Buffer | null {
  const p = cachePath(sessionId, stage);
  if (!existsSync(p)) return null;
  return readFileSync(p);
}

export function writeCachedCollage(sessionId: string, stage: number, buf: Buffer): void {
  writeFileSync(cachePath(sessionId, stage), buf);
}

async function cardFace(
  card: DrawnCard | null,
  faceUp: boolean,
  width: number,
  height: number
): Promise<Buffer> {
  const back = resolveBackPath();
  const facePath = faceUp && card ? resolveCardPath(card.slug) : null;
  if (faceUp && card && !facePath) {
    console.warn(`[collage] missing asset for slug=${card.slug} — using back`);
    reportAssetMissing(card.slug);
  }
  const path = faceUp ? facePath ?? back : back;
  let pipeline = path
    ? sharp(path).resize(width, height, { fit: "cover" })
    : sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 22, g: 18, b: 16 },
        },
      });

  if (faceUp && card?.reversed && facePath) {
    pipeline = pipeline.rotate(180);
  }

  return pipeline.png().toBuffer();
}

export type CollageOptions = {
  revealedCount: number; // 0..3
  question?: string;
  watermark?: boolean;
  captionHint?: string;
};

/** Vertical 4:5 collage, long side HEIGHT=1400. revealedCount=0 → all backs. */
export async function renderTripletCollage(
  cards: DrawnCard[],
  options: CollageOptions = { revealedCount: 3 }
): Promise<Buffer> {
  const pad = 48;
  const gap = 28;
  const labelH = 36;
  const titleH = 40;
  const qH = options.question ? 52 : 0;
  const usableH = HEIGHT - pad * 2 - titleH - qH - 24;
  const cardH = usableH - labelH;
  const cardW = Math.floor((WIDTH - pad * 2 - gap * 2) / 3);

  const faces = await Promise.all(
    [0, 1, 2].map((i) =>
      cardFace(cards[i] ?? null, i < options.revealedCount, cardW, cardH)
    )
  );

  const labels = [0, 1, 2].map((i) => {
    const c = cards[i];
    if (!c || i >= options.revealedCount) return "";
    return `${c.positionLabel} · ${c.name}${c.reversed ? " · перевёрнута" : ""}`;
  });

  const qLine = options.question
    ? escapeXml(options.question.length > 72 ? `${options.question.slice(0, 69)}…` : options.question)
    : "";

  const svg = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}">
      <defs>
        <radialGradient id="g" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stop-color="#2A221C"/>
          <stop offset="100%" stop-color="#0E0C0B"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect x="18" y="18" width="${WIDTH - 36}" height="${HEIGHT - 36}" fill="none" stroke="#C4A574" stroke-opacity="0.35" stroke-width="1"/>
      <text x="50%" y="${pad + 8}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="22" fill="#C4A574">Zovus</text>
      ${
        qLine
          ? `<text x="50%" y="${pad + titleH}" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#E8DFD4">${qLine}</text>`
          : ""
      }
      ${labels
        .map((lab, i) => {
          if (!lab) return "";
          const x = pad + i * (cardW + gap) + cardW / 2;
          const y = pad + titleH + qH + cardH + 28;
          return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="#B9A990">${escapeXml(lab)}</text>`;
        })
        .join("")}
      ${
        options.watermark
          ? `<text x="${WIDTH - pad}" y="${HEIGHT - 22}" text-anchor="end" font-family="Georgia, serif" font-size="14" fill="#8A7B68">zovus.ru</text>`
          : ""
      }
    </svg>`
  );

  const top = pad + titleH + qH + 8;
  const composites = faces.map((input, i) => ({
    input,
    left: pad + i * (cardW + gap),
    top,
  }));

  return sharp(svg).composite(composites).jpeg({ quality: 90 }).toBuffer();
}

export async function renderDayCardImage(card: DrawnCard): Promise<Buffer> {
  const cardW = 520;
  const cardH = 820;
  const pad = 80;
  const width = WIDTH;
  const height = HEIGHT;
  const panel = await cardFace(card, true, cardW, cardH);
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#0E0C0B"/>
      <rect x="18" y="18" width="${width - 36}" height="${height - 36}" fill="none" stroke="#C4A574" stroke-opacity="0.35" stroke-width="1"/>
      <text x="50%" y="56" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="#C4A574">Карта дня</text>
      <text x="50%" y="${height - 48}" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#B9A990">${escapeXml(card.name)}${card.reversed ? " · перевёрнута" : ""}</text>
    </svg>`
  );
  return sharp(svg)
    .composite([{ input: panel, left: Math.floor((width - cardW) / 2), top: pad }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function renderShareCollage(cards: DrawnCard[], question: string): Promise<Buffer> {
  return renderTripletCollage(cards, {
    revealedCount: 3,
    question,
    watermark: true,
  });
}

export { WIDTH as COLLAGE_WIDTH, HEIGHT as COLLAGE_HEIGHT };
