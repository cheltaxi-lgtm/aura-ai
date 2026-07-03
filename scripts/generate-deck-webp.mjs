/**
 * Generate .webp siblings for PNG files under public/decks (idempotent).
 * Run: node scripts/generate-deck-webp.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DECKS_DIR = path.join(__dirname, "..", "public", "decks");

function walkPng(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPng(full, out);
    else if (entry.name.endsWith(".png")) out.push(full);
  }
  return out;
}

async function main() {
  if (!fs.existsSync(DECKS_DIR)) {
    console.log("No public/decks directory — skip");
    return;
  }

  const pngs = walkPng(DECKS_DIR);
  let created = 0;
  let skipped = 0;

  for (const pngPath of pngs) {
    const webpPath = pngPath.replace(/\.png$/i, ".webp");
    const pngStat = fs.statSync(pngPath);
    if (fs.existsSync(webpPath)) {
      const webpStat = fs.statSync(webpPath);
      if (webpStat.mtimeMs >= pngStat.mtimeMs) {
        skipped += 1;
        continue;
      }
    }
    await sharp(pngPath).webp({ quality: 82, effort: 4 }).toFile(webpPath);
    created += 1;
  }

  console.log(`deck-webp: ${created} created, ${skipped} up-to-date (${pngs.length} png total)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
