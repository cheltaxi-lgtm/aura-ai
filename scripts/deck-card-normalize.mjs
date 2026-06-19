/**
 * Removes AI letterboxing (white side bars) and normalizes deck faces to 533×800.
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

export const CARD_WIDTH = 533;
export const CARD_HEIGHT = 800;
export const CARD_BG = { r: 8, g: 6, b: 18 };

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

/** Crop horizontal white/grey bars using middle-band column analysis. */
export async function cropSideLetterbox(input) {
  const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const y0 = Math.floor(h * 0.12);
  const y1 = Math.floor(h * 0.88);
  let minX = w;
  let maxX = 0;

  for (let x = 0; x < w; x++) {
    let light = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      const i = (y * w + x) * ch;
      if (data[i] > 210 && data[i + 1] > 210 && data[i + 2] > 210) light++;
      n++;
    }
    if (light / n < 0.45) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }

  if (minX >= maxX) return input;

  const pad = 2;
  const left = Math.max(0, minX - pad);
  const right = Math.min(w - 1, maxX + pad);
  const width = right - left + 1;
  if (width < w * 0.45) return input;

  return sharp(input)
    .extract({ left, top: 0, width, height: h })
    .toBuffer();
}

export async function normalizeDeckCardBuffer(input) {
  let buf = await cropSideLetterbox(input);
  try {
    buf = await sharp(buf).trim({ threshold: 18 }).toBuffer();
  } catch {
    /* uniform image — trim not needed */
  }
  return sharp(buf)
    .resize(CARD_WIDTH, CARD_HEIGHT, {
      fit: "cover",
      position: "centre",
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

export async function normalizeDeckCardFile(filePath, { force = false } = {}) {
  const before = fs.readFileSync(filePath);
  const ratio = await whitePixelRatio(before);
  const brightness = await meanBrightness(before);
  const needsFix = force || ratio >= 0.06 || brightness > 130;
  if (!needsFix) {
    return { changed: false, whiteBefore: ratio, whiteAfter: ratio, brightness };
  }

  const afterBuf = await normalizeDeckCardBuffer(before);
  const afterRatio = await whitePixelRatio(afterBuf);
  const afterBrightness = await meanBrightness(afterBuf);
  if (!force && afterRatio >= ratio - 0.01 && afterBrightness >= brightness - 5) {
    return { changed: false, whiteBefore: ratio, whiteAfter: afterRatio, brightness };
  }

  fs.writeFileSync(filePath, afterBuf);
  return {
    changed: true,
    whiteBefore: ratio,
    whiteAfter: afterRatio,
    brightness,
    brightnessAfter: afterBrightness,
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
          brightness: result.brightness != null ? Math.round(result.brightness) : undefined,
          brightnessAfter:
            result.brightnessAfter != null ? Math.round(result.brightnessAfter) : undefined,
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
    const extra =
      row.brightness != null
        ? ` · brightness ${row.brightness}→${row.brightnessAfter}`
        : "";
    console.log(`  ${row.deck}/${row.file}: ${row.whiteBefore}% white → ${row.whiteAfter}%${extra}`);
  }
}
