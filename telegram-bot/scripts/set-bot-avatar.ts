/**
 * Render site BrandMark → JPG and set as Telegram bot profile photo.
 * Run: npx tsx scripts/set-bot-avatar.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { botConfig } from "../src/config.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = resolve(root, "assets/brand-mark.svg");
const outDir = resolve(root, "assets");
const jpgPath = resolve(outDir, "bot-avatar.jpg");

async function renderAvatar(): Promise<Buffer> {
  mkdirSync(outDir, { recursive: true });
  const svg = readFileSync(svgPath);
  const jpg = await sharp(svg, { density: 600 })
    .resize(640, 640, { fit: "fill" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  writeFileSync(jpgPath, jpg);
  console.log(`[avatar] wrote ${jpgPath} (${jpg.length} bytes)`);
  return jpg;
}

async function setProfilePhoto(jpg: Buffer): Promise<void> {
  const form = new FormData();
  form.append(
    "photo",
    JSON.stringify({ type: "static", photo: "attach://avatar" })
  );
  form.append("avatar", new Blob([jpg], { type: "image/jpeg" }), "bot-avatar.jpg");

  const url = `https://api.telegram.org/bot${botConfig.token}/setMyProfilePhoto`;
  const res = await fetch(url, { method: "POST", body: form });
  const body = (await res.json()) as { ok: boolean; description?: string; result?: boolean };
  if (!body.ok) {
    throw new Error(body.description || `HTTP ${res.status}`);
  }
  console.log("[avatar] setMyProfilePhoto → ok");
}

async function main() {
  const jpg = await renderAvatar();
  await setProfilePhoto(jpg);
}

main().catch((err) => {
  console.error("[avatar] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
