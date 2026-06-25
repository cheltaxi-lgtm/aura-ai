/**
 * Removes obvious AI letterboxing (white side bars) and normalizes deck faces to 533×800.
 * Conservative: only crops near-pure white bars; resize uses contain (no art crop).
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

export const CARD_WIDTH = 533;
export const CARD_HEIGHT = 800;
export const CARD_BG = { r: 8, g: 6, b: 18 };

const MIN_BAR_WIDTH = 12;
const BAR_LIGHT_THRESHOLD = 0.82;

export async function whitePixelRatio(buffer, threshold = 235) {
  const { data } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let white = 0;
  const total = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    if (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold) {
      white++;
    }
  }
  return white / total;
}

function columnLightScores(data, w, h, ch) {
  const y0 = Math.floor(h * 0.15);
  const y1 = Math.floor(h * 0.85);
  const scores = new Array(w);
  for (let x = 0; x < w; x++) {
    let light = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      const i = (y * w + x) * ch;
      if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) light++;
      n++;
    }
    scores[x] = light / n;
  }
  return scores;
}

function rowLightScores(data, w, h, ch) {
  const x0 = Math.floor(w * 0.15);
  const x1 = Math.floor(w * 0.85);
  const scores = new Array(h);
  for (let y = 0; y < h; y++) {
    let light = 0;
    let n = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * ch;
      if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) light++;
      n++;
    }
    scores[y] = light / n;
  }
  return scores;
}

function columnMeanBrightness(data, w, h, ch) {
  const y0 = Math.floor(h * 0.15);
  const y1 = Math.floor(h * 0.85);
  const scores = new Array(w);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      const i = (y * w + x) * ch;
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      n++;
    }
    scores[x] = sum / n;
  }
  return scores;
}

/** Returns { topBar, bottomBar } in pixels for near-pure white top/bottom bars. */
export function measureTopBottomLetterbox(scores) {
  const h = scores.length;
  let topBar = 0;
  for (let y = 0; y < Math.floor(h * 0.3); y++) {
    if (scores[y] >= BAR_LIGHT_THRESHOLD) topBar = y + 1;
    else if (topBar >= MIN_BAR_WIDTH) break;
  }

  let bottomBar = 0;
  for (let y = h - 1; y >= Math.floor(h * 0.7); y--) {
    if (scores[y] >= BAR_LIGHT_THRESHOLD) bottomBar = h - y;
    else if (bottomBar >= MIN_BAR_WIDTH) break;
  }

  return { topBar, bottomBar };
}

/** Crop columns where art is visibly narrower than frame (tan/cream margins). */
export function measureNarrowContentCrop(colBrightness, w) {
  const CONTENT_MAX = 95;
  let left = -1;
  let right = -1;
  for (let x = 0; x < w; x++) {
    if (colBrightness[x] <= CONTENT_MAX) {
      if (left === -1) left = x;
      right = x;
    }
  }
  const contentW = right - left + 1;
  if (left === -1 || contentW < w * 0.35 || contentW > w * 0.92) {
    return { leftCrop: 0, rightCrop: 0 };
  }
  const margin = Math.min(left, w - right - 1);
  if (margin < MIN_BAR_WIDTH) return { leftCrop: 0, rightCrop: 0 };
  return { leftCrop: left, rightCrop: w - right - 1 };
}

/** Returns { leftBar, rightBar } in pixels for near-pure white side bars only. */
export function measureSideLetterbox(scores) {
  const w = scores.length;
  let leftBar = 0;
  for (let x = 0; x < Math.floor(w * 0.3); x++) {
    if (scores[x] >= BAR_LIGHT_THRESHOLD) leftBar = x + 1;
    else if (leftBar >= MIN_BAR_WIDTH) break;
  }

  let rightBar = 0;
  for (let x = w - 1; x >= Math.floor(w * 0.7); x--) {
    if (scores[x] >= BAR_LIGHT_THRESHOLD) rightBar = w - x;
    else if (rightBar >= MIN_BAR_WIDTH) break;
  }

  return { leftBar, rightBar };
}

/** Crop obvious white side bars and top/bottom letterboxing; trim narrow centered art. */
export async function cropLetterbox(input) {
  const { data, info } = await sharp(input).png().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const colScores = columnLightScores(data, w, h, ch);
  const { leftBar, rightBar } = measureSideLetterbox(colScores);

  const rowScores = rowLightScores(data, w, h, ch);
  const { topBar, bottomBar } = measureTopBottomLetterbox(rowScores);

  const colMean = columnMeanBrightness(data, w, h, ch);
  const { leftCrop, rightCrop } = measureNarrowContentCrop(colMean, w);

  let left = 0;
  let right = w - 1;
  let top = 0;
  let bottom = h - 1;

  if (leftBar >= MIN_BAR_WIDTH) left = leftBar;
  if (rightBar >= MIN_BAR_WIDTH) right = w - rightBar - 1;
  if (topBar >= MIN_BAR_WIDTH) top = topBar;
  if (bottomBar >= MIN_BAR_WIDTH) bottom = h - bottomBar - 1;
  if (leftCrop >= MIN_BAR_WIDTH) left = Math.max(left, leftCrop);
  if (rightCrop >= MIN_BAR_WIDTH) right = Math.min(right, w - rightCrop - 1);

  const width = right - left + 1;
  const height = bottom - top + 1;
  if (
    width < w * 0.55 ||
    height < h * 0.55 ||
    (left === 0 && right === w - 1 && top === 0 && bottom === h - 1)
  ) {
    return input;
  }

  return sharp(input)
    .extract({ left, top, width, height })
    .toBuffer();
}

/** @deprecated use cropLetterbox */
export async function cropSideLetterbox(input) {
  return cropLetterbox(input);
}

export async function normalizeDeckCardBuffer(input) {
  const buf = await cropLetterbox(input);
  return sharp(buf)
    .resize(CARD_WIDTH, CARD_HEIGHT, {
      fit: "contain",
      background: CARD_BG,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function meanBrightness(buffer) {
  const { data } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  const n = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return sum / n;
}

export async function topBottomLetterboxPixels(buffer) {
  const { data, info } = await sharp(buffer).png().raw().toBuffer({ resolveWithObject: true });
  const scores = rowLightScores(data, info.width, info.height, info.channels);
  const { topBar, bottomBar } = measureTopBottomLetterbox(scores);
  return Math.max(topBar, bottomBar);
}

export async function sideLetterboxPixels(buffer) {
  const { data, info } = await sharp(buffer).png().raw().toBuffer({ resolveWithObject: true });
  const scores = columnLightScores(data, info.width, info.height, info.channels);
  const { leftBar, rightBar } = measureSideLetterbox(scores);
  return Math.max(leftBar, rightBar);
}

export async function normalizeDeckCardFile(filePath, { force = false } = {}) {
  const before = fs.readFileSync(filePath);
  const ratio = await whitePixelRatio(before);
  const edgeBar = await sideLetterboxPixels(before);
  const tbBar = await topBottomLetterboxPixels(before);
  const needsFix = force || ratio >= 0.08 || edgeBar >= MIN_BAR_WIDTH || tbBar >= MIN_BAR_WIDTH;
  if (!needsFix) {
    return { changed: false, whiteBefore: ratio, whiteAfter: ratio, edgeBar };
  }

  const afterBuf = await normalizeDeckCardBuffer(before);
  const afterRatio = await whitePixelRatio(afterBuf);
  const afterEdge = await sideLetterboxPixels(afterBuf);

  const edgeImproved = afterEdge + 2 < edgeBar;
  const ratioImproved = afterRatio + 0.01 < ratio;
  if (!force && !edgeImproved && !ratioImproved) {
    return {
      changed: false,
      whiteBefore: ratio,
      whiteAfter: afterRatio,
      edgeBar,
      edgeBarAfter: afterEdge,
    };
  }

  fs.writeFileSync(filePath, afterBuf);
  return {
    changed: true,
    whiteBefore: ratio,
    whiteAfter: afterRatio,
    edgeBar,
    edgeBarAfter: afterEdge,
  };
}

export async function normalizeAllDeckCards(rootDir) {
  const results = [];
  for (const deck of fs.readdirSync(rootDir)) {
    const dir = path.join(rootDir, deck);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".png") || file === "_back.png") continue;
      const filePath = path.join(dir, file);
      const result = await normalizeDeckCardFile(filePath);
      if (result.changed) {
        results.push({
          deck,
          file,
          whiteBefore: Math.round(result.whiteBefore * 100),
          whiteAfter: Math.round(result.whiteAfter * 100),
          edgeBar: result.edgeBar,
          edgeBarAfter: result.edgeBarAfter,
        });
      }
    }
  }
  return results;
}

import { fileURLToPath } from "url";

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "decks");
  const fixed = await normalizeAllDeckCards(root);
  console.log(`Normalized ${fixed.length} card(s):`);
  for (const row of fixed) {
    const edge =
      row.edgeBar != null ? ` · edge ${row.edgeBar}px→${row.edgeBarAfter}px` : "";
    console.log(`  ${row.deck}/${row.file}: ${row.whiteBefore}% white → ${row.whiteAfter}%${edge}`);
  }
}
