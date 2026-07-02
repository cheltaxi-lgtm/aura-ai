#!/usr/bin/env node
/**
 * Regenerate Android launcher PNGs from src/app/icon.svg (requires sharp).
 * Usage: node scripts/generate-android-icons.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = path.join(root, "src/app/icon.svg");
const resRoot = path.join(root, "mobile/android/app/src/main/res");

const SIZES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

const svg = await readFile(svgPath);

for (const [density, size] of Object.entries(SIZES)) {
  const dir = path.join(resRoot, `mipmap-${density}`);
  await mkdir(dir, { recursive: true });
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  await writeFile(path.join(dir, "ic_launcher.png"), png);
  await writeFile(path.join(dir, "ic_launcher_round.png"), png);
  const fgSize = Math.round(size * 1.35);
  const fg = await sharp(svg).resize(fgSize, fgSize).png().toBuffer();
  await writeFile(path.join(dir, "ic_launcher_foreground.png"), fg);
}

console.log("Android launcher icons regenerated from icon.svg");
