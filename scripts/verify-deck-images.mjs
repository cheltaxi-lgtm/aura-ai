#!/usr/bin/env node
/**
 * Verifies public/decks raster assets are ready for Next.js Image optimization (WebP/AVIF via sharp).
 * Run: npm run verify:deck-images
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DECKS_DIR = path.join(ROOT, "public", "decks");

const RASTER_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
const VECTOR_EXT = new Set([".svg"]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  if (!fs.existsSync(DECKS_DIR)) {
    console.error("Missing public/decks directory");
    process.exit(1);
  }

  let sharpOk = false;
  try {
    await import("sharp");
    sharpOk = true;
  } catch {
    sharpOk = false;
  }

  const allFiles = walk(DECKS_DIR);
  const stats = { png: 0, jpg: 0, webp: 0, svg: 0, other: 0, totalBytes: 0, missingManifestRefs: 0 };
  const rasterFiles = [];

  for (const file of allFiles) {
    const ext = path.extname(file).toLowerCase();
    const size = fs.statSync(file).size;
    if (RASTER_EXT.has(ext)) {
      stats[ext.slice(1)] = (stats[ext.slice(1)] ?? 0) + 1;
      if (ext === ".png") stats.png += 1;
      stats.totalBytes += size;
      rasterFiles.push({ file, ext, size });
    } else if (VECTOR_EXT.has(ext)) {
      stats.svg += 1;
    } else if (ext === ".json") {
      /* manifest */
    } else {
      stats.other += 1;
    }
  }

  const manifests = allFiles.filter((f) => f.endsWith("manifest.json"));
  for (const manifestPath of manifests) {
    const deckDir = path.dirname(manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    for (const item of Object.values(manifest.items ?? {})) {
      const fileName = item?.file;
      if (!fileName) continue;
      const assetPath = path.join(deckDir, fileName);
      if (!fs.existsSync(assetPath)) {
        stats.missingManifestRefs += 1;
        console.warn(`  missing: ${path.relative(ROOT, assetPath)}`);
      }
    }
  }

  console.log("Deck image readiness for Next.js Image (WebP/AVIF)");
  console.log("─".repeat(52));
  console.log(`sharp available: ${sharpOk ? "yes" : "NO — run npm install"}`);
  console.log(`PNG rasters:     ${stats.png}`);
  console.log(`WebP rasters:    ${stats.webp ?? 0}`);
  console.log(`SVG vectors:     ${stats.svg} (served as-is, not converted)`);
  console.log(`Total PNG bytes: ${formatBytes(stats.totalBytes)}`);
  console.log(`Manifest gaps:   ${stats.missingManifestRefs}`);
  console.log(`next.config formats: image/avif, image/webp`);

  const heavy = rasterFiles
    .filter((r) => r.ext === ".png" && r.size > 400 * 1024)
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);

  if (heavy.length) {
    console.log("\nLargest PNG (Next.js will serve WebP/AVIF variants):");
    for (const r of heavy) {
      console.log(`  ${formatBytes(r.size).padStart(8)}  ${path.relative(ROOT, r.file)}`);
    }
  }

  if (!sharpOk) {
    console.error("\nFAIL: sharp is required for production image optimization.");
    process.exit(1);
  }
  if (stats.missingManifestRefs > 0) {
    console.error("\nFAIL: manifest references missing files.");
    process.exit(1);
  }

  console.log("\nOK: deck rasters are ready for Next.js automatic WebP/AVIF optimization.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
