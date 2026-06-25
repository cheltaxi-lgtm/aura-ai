/**
 * Point-fix deck PNGs identified from gallery screenshots.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeDeckCardFile } from "./deck-card-normalize.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BUILD = path.join(__dirname, "build-decks.mjs");

const TAROT_VERONIKA = [
  "the-lovers",
  "the-chariot",
  "strength",
  "the-hermit",
  "wheel-of-fortune",
  "justice",
  "the-hanged-man",
  "two-of-cups",
  "three-of-cups",
  "four-of-cups",
  "five-of-cups",
  "six-of-cups",
  "seven-of-cups",
  "eight-of-cups",
  "judgement",
];

const ASTROLOGY_REGEN = ["mangala", "guru-jupiter", "pisces", "taurus", "virgo"];

function runBuild(system, only, force = true) {
  const args = [
    BUILD,
    force ? "--force" : "",
    `--system=${system}`,
    `--only=${only.join(",")}`,
  ].filter(Boolean);

  console.log(`\n>>> node ${args.slice(1).join(" ")}`);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`build-decks failed for ${system} (${result.status})`);
  }
}

console.log("=== Targeted deck card fixes ===\n");

runBuild("tarot-veronika", TAROT_VERONIKA);
runBuild("astrology", ASTROLOGY_REGEN);

console.log("\n>>> normalize rahu (top/bottom letterbox)");
const rahuPath = path.join(ROOT, "public", "decks", "astrology", "rahu.png");
await normalizeDeckCardFile(rahuPath, { force: true });

console.log("\n>>> shani: keep git art, normalize only");
const shaniPath = path.join(ROOT, "public", "decks", "astrology", "shani.png");
await normalizeDeckCardFile(shaniPath, { force: true });

console.log("\n=== Done ===");
