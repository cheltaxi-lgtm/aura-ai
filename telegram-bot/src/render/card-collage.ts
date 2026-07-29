import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { botConfig } from "../config.js";
import { reportAssetMissing, resolveAssetPath } from "../domain/deck/asset-check.js";
import type { DrawnCard } from "../domain/deck/types.js";

/** Classic tarot face ratio (width / height) — matches deck assets (~533×800). */
const CARD_ASPECT = 2 / 3;
const FACE_BG = { r: 14, g: 12, b: 11, alpha: 1 };
const CANVAS_BG = { r: 14, g: 12, b: 11 };

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

/**
 * Full card face inside the slot — never crop art (contain + dark pad).
 */
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
  if (!path) {
    return sharp({
      create: { width, height, channels: 3, background: CANVAS_BG },
    })
      .png()
      .toBuffer();
  }

  let pipeline = sharp(path);
  if (faceUp && card?.reversed && facePath) {
    pipeline = pipeline.rotate(180);
  }

  return pipeline
    .resize(width, height, {
      fit: "contain",
      background: FACE_BG,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

export type CollageOptions = {
  revealedCount: number; // 0..3
  question?: string;
  watermark?: boolean;
  captionHint?: string;
};

/**
 * Tight triplet collage sized to the cards (no giant empty canvas).
 * Card slots keep 2:3 so faces render fully — never cover-cropped.
 */
export async function renderTripletCollage(
  cards: DrawnCard[],
  options: CollageOptions = { revealedCount: 3 }
): Promise<Buffer> {
  const padX = 40;
  const padTop = 56;
  const padBottom = 36;
  const gap = 18;
  const titleH = 28;
  const qH = options.question ? 36 : 0;
  const labelH = 48;

  // Target Telegram-friendly width; height follows content.
  const width = 1080;
  const innerW = width - padX * 2;
  const cardW = Math.floor((innerW - gap * 2) / 3);
  const cardH = Math.round(cardW / CARD_ASPECT);
  const height = padTop + titleH + qH + 12 + cardH + labelH + padBottom;

  const rowWidth = cardW * 3 + gap * 2;
  const rowLeft = Math.floor((width - rowWidth) / 2);
  const top = padTop + titleH + qH + 12;
  const labelY1 = top + cardH + 20;
  const labelY2 = labelY1 + 20;

  const faces = await Promise.all(
    [0, 1, 2].map((i) =>
      cardFace(cards[i] ?? null, i < options.revealedCount, cardW, cardH)
    )
  );

  const labels = [0, 1, 2].map((i) => {
    const c = cards[i];
    if (!c || i >= options.revealedCount) return "";
    const rev = c.reversed ? " · перев." : "";
    return `${c.positionLabel}\n${c.name}${rev}`;
  });

  const qLine = options.question
    ? escapeXml(options.question.length > 64 ? `${options.question.slice(0, 61)}…` : options.question)
    : "";

  const svg = Buffer.from(
    `<svg width="${width}" height="${height}">
      <defs>
        <radialGradient id="g" cx="50%" cy="35%" r="75%">
          <stop offset="0%" stop-color="#2A221C"/>
          <stop offset="100%" stop-color="#0E0C0B"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect x="14" y="14" width="${width - 28}" height="${height - 28}" fill="none" stroke="#C4A574" stroke-opacity="0.4" stroke-width="1"/>
      <text x="50%" y="${padTop - 8}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="22" fill="#C4A574">Zovus</text>
      ${
        qLine
          ? `<text x="50%" y="${padTop + titleH}" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#E8DFD4">${qLine}</text>`
          : ""
      }
      ${labels
        .map((lab, i) => {
          if (!lab) return "";
          const [pos, name] = lab.split("\n");
          const x = rowLeft + i * (cardW + gap) + cardW / 2;
          return `<text x="${x}" y="${labelY1}" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="#C4A574">${escapeXml(pos || "")}</text>
          <text x="${x}" y="${labelY2}" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#F2E8D8">${escapeXml(name || "")}</text>`;
        })
        .join("")}
      ${
        options.watermark
          ? `<text x="${width - padX}" y="${height - 16}" text-anchor="end" font-family="Georgia, serif" font-size="13" fill="#8A7B68">zovus.ru</text>`
          : ""
      }
    </svg>`
  );

  const composites = faces.map((input, i) => ({
    input,
    left: rowLeft + i * (cardW + gap),
    top,
  }));

  return sharp(svg).composite(composites).jpeg({ quality: 92 }).toBuffer();
}

export async function renderDayCardImage(card: DrawnCard): Promise<Buffer> {
  const width = 720;
  const cardW = 420;
  const cardH = Math.round(cardW / CARD_ASPECT);
  const padTop = 64;
  const padBottom = 56;
  const height = padTop + cardH + padBottom + 24;
  const panel = await cardFace(card, true, cardW, cardH);
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#0E0C0B"/>
      <rect x="14" y="14" width="${width - 28}" height="${height - 28}" fill="none" stroke="#C4A574" stroke-opacity="0.4" stroke-width="1"/>
      <text x="50%" y="44" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="#C4A574">Карта дня</text>
      <text x="50%" y="${height - 28}" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#F2E8D8">${escapeXml(card.name)}${card.reversed ? " · перевёрнута" : ""}</text>
    </svg>`
  );
  return sharp(svg)
    .composite([{ input: panel, left: Math.floor((width - cardW) / 2), top: padTop }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function renderShareCollage(cards: DrawnCard[], question: string): Promise<Buffer> {
  return renderTripletCollage(cards, {
    revealedCount: 3,
    question,
    watermark: true,
  });
}

export const COLLAGE_WIDTH = 1080;
export const COLLAGE_HEIGHT = 900;
