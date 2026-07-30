import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { botConfig } from "../config.js";
import { reportAssetMissing, resolveAssetPath } from "../domain/deck/asset-check.js";
import type { DrawnCard } from "../domain/deck/types.js";
import {
  BOT_CANVAS_HEIGHT,
  BOT_CANVAS_WIDTH,
  encodeBotJpeg,
  getOrnatePlate,
} from "./canvas.js";

/** Classic tarot face ratio (width / height) — matches deck assets (~533×800). */
const CARD_ASPECT = 2 / 3;
const FACE_BG = { r: 14, g: 12, b: 11, alpha: 1 };
const CANVAS_BG = { r: 14, g: 12, b: 11 };
/** Site photo-rasklad max; keep collage readable in Telegram. */
export const MAX_COLLAGE_CARDS = 12;

type RawFace = {
  input: Buffer;
  raw: { width: number; height: number; channels: 3 | 4 };
};

const FACE_CACHE_MAX = 96;
const faceCache = new Map<string, RawFace>();

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

function rememberFace(key: string, face: RawFace): RawFace {
  if (faceCache.size >= FACE_CACHE_MAX) {
    const oldest = faceCache.keys().next().value;
    if (oldest) faceCache.delete(oldest);
  }
  faceCache.set(key, face);
  return face;
}

async function cardFace(
  card: DrawnCard | null,
  faceUp: boolean,
  width: number,
  height: number
): Promise<RawFace> {
  const slug = faceUp && card ? card.slug : "_back";
  const reversed = Boolean(faceUp && card?.reversed);
  const key = `${slug}|${width}x${height}|${reversed ? 1 : 0}|${faceUp ? 1 : 0}`;
  const hit = faceCache.get(key);
  if (hit) return hit;

  const back = resolveBackPath();
  const facePath = faceUp && card ? resolveCardPath(card.slug) : null;
  if (faceUp && card && !facePath) {
    console.warn(`[collage] missing asset for slug=${card.slug} — using back`);
    reportAssetMissing(card.slug);
  }
  const path = faceUp ? facePath ?? back : back;
  if (!path) {
    const { data, info } = await sharp({
      create: { width, height, channels: 3, background: CANVAS_BG },
    })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return rememberFace(key, {
      input: data,
      raw: { width: info.width, height: info.height, channels: info.channels as 3 | 4 },
    });
  }

  let pipeline = sharp(path);
  if (reversed && facePath) {
    pipeline = pipeline.rotate(180);
  }

  const { data, info } = await pipeline
    .resize(width, height, {
      fit: "contain",
      background: FACE_BG,
      withoutEnlargement: false,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return rememberFace(key, {
    input: data,
    raw: { width: info.width, height: info.height, channels: info.channels as 3 | 4 },
  });
}

export type CollageOptions = {
  revealedCount?: number;
  question?: string;
  watermark?: boolean;
  captionHint?: string;
};

function gridLayout(n: number): { cols: number; rows: number } {
  const count = Math.max(1, Math.min(MAX_COLLAGE_CARDS, n));
  if (count <= 3) return { cols: count, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  return { cols: 4, rows: Math.ceil(count / 4) };
}

/**
 * Spread collage laid out on the fixed 1080×1350 canvas (no shrink → larger type).
 */
export async function renderSpreadCollage(
  cards: DrawnCard[],
  options: CollageOptions = {}
): Promise<Buffer> {
  const list = cards.slice(0, MAX_COLLAGE_CARDS);
  const n = Math.max(1, list.length);
  const revealed = Math.min(n, options.revealedCount ?? n);
  const { cols, rows } = gridLayout(n);

  const width = BOT_CANVAS_WIDTH;
  const height = BOT_CANVAS_HEIGHT;
  const padX = 56;
  const padTop = 118;
  const padBottom = 72;
  const gap = n >= 7 ? 18 : 22;
  const labelH = n >= 7 ? 52 : 58;
  const qH = options.question ? 40 : 0;

  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom - qH - 8;
  // Card slot = face + label under it
  const slotH = Math.floor((innerH - gap * (rows - 1)) / rows);
  const cardH = Math.min(
    Math.round(slotH - labelH),
    Math.round(((innerW - gap * (cols - 1)) / cols) / CARD_ASPECT)
  );
  const cardW = Math.round(cardH * CARD_ASPECT);

  const gridW = cols * cardW + (cols - 1) * gap;
  const gridH = rows * (cardH + labelH) + (rows - 1) * gap;
  const gridLeft = Math.floor((width - gridW) / 2);
  const gridTop = padTop + qH + Math.floor((innerH - qH - gridH) / 2);

  const nameSize = cardW >= 280 ? 20 : cardW >= 200 ? 17 : 14;
  const posSize = Math.max(12, nameSize - 3);

  const [plate, faces] = await Promise.all([
    getOrnatePlate(),
    Promise.all(
      Array.from({ length: n }, (_, i) =>
        cardFace(list[i] ?? null, i < revealed, cardW, cardH)
      )
    ),
  ]);

  const qLine = options.question
    ? escapeXml(
        options.question.length > 52
          ? `${options.question.slice(0, 49)}…`
          : options.question
      )
    : "";

  const overlays: string[] = [];
  const labelSvg = list
    .map((c, i) => {
      if (!c || i >= revealed) return "";
      const col = i % cols;
      const row = Math.floor(i / cols);
      const left = gridLeft + col * (cardW + gap);
      const top = gridTop + row * (cardH + labelH + gap);
      const cx = left + cardW / 2;
      const y1 = top + cardH + 22;
      const y2 = y1 + nameSize + 4;
      const rev = c.reversed ? " · перев." : "";
      const pos = c.positionLabel || `Карта ${i + 1}`;
      const name = `${c.name}${rev}`;
      overlays.push(
        `<rect x="${left - 3}" y="${top - 3}" width="${cardW + 6}" height="${cardH + 6}"
          fill="none" stroke="#C4A574" stroke-opacity="0.65" stroke-width="2" rx="4"/>`
      );
      return `<text x="${cx}" y="${y1}" text-anchor="middle" font-family="Georgia, serif" font-size="${posSize}" fill="#C4A574">${escapeXml(pos)}</text>
      <text x="${cx}" y="${y2}" text-anchor="middle" font-family="Georgia, serif" font-size="${nameSize}" fill="#F5EDE3">${escapeXml(name)}</text>`;
    })
    .join("");

  const overlaySvg = Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${
        qLine
          ? `<text x="50%" y="${padTop - 8}" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#E8D5A8">${qLine}</text>`
          : ""
      }
      ${overlays.join("\n")}
      ${labelSvg}
      ${
        options.watermark
          ? `<text x="${width - 56}" y="${height - 40}" text-anchor="end" font-family="Georgia, serif" font-size="16" fill="#8A7349">zovus.ru</text>`
          : ""
      }
    </svg>`
  );

  const composites = [
    ...faces.map((face, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        input: face.input,
        raw: face.raw,
        left: gridLeft + col * (cardW + gap),
        top: gridTop + row * (cardH + labelH + gap),
      };
    }),
    { input: overlaySvg },
  ];

  return encodeBotJpeg(sharp(plate).composite(composites));
}

export async function renderTripletCollage(
  cards: DrawnCard[],
  options: CollageOptions & { revealedCount?: number } = { revealedCount: 3 }
): Promise<Buffer> {
  return renderSpreadCollage(cards.slice(0, 3), {
    ...options,
    revealedCount: options.revealedCount ?? 3,
  });
}

export async function renderDayCardImage(card: DrawnCard): Promise<Buffer> {
  const width = BOT_CANVAS_WIDTH;
  const height = BOT_CANVAS_HEIGHT;
  const cardW = 520;
  const cardH = Math.round(cardW / CARD_ASPECT);
  const top = Math.floor((height - cardH) / 2) - 20;
  const left = Math.floor((width - cardW) / 2);
  const [plate, panel] = await Promise.all([getOrnatePlate(), cardFace(card, true, cardW, cardH)]);
  const overlaySvg = Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="50%" y="110" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#E8D5A8">Карта дня</text>
      <rect x="${left - 4}" y="${top - 4}" width="${cardW + 8}" height="${cardH + 8}"
        fill="none" stroke="#C4A574" stroke-opacity="0.7" stroke-width="2.5" rx="6"/>
      <text x="50%" y="${height - 56}" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#F5EDE3">${escapeXml(card.name)}${card.reversed ? " · перевёрнута" : ""}</text>
    </svg>`
  );
  return encodeBotJpeg(
    sharp(plate).composite([
      { input: panel.input, raw: panel.raw, left, top },
      { input: overlaySvg },
    ])
  );
}

export async function renderShareCollage(cards: DrawnCard[], question: string): Promise<Buffer> {
  return renderTripletCollage(cards, {
    revealedCount: 3,
    question,
    watermark: true,
  });
}

export const COLLAGE_WIDTH = BOT_CANVAS_WIDTH;
export const COLLAGE_HEIGHT = BOT_CANVAS_HEIGHT;
