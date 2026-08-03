#!/usr/bin/env node
/**
 * Ensure long reading/report surfaces use the shared premium renderer.
 * Run: npx tsx scripts/verify-premium-reading-surfaces.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/** Surfaces that must import ChatMessageRenderer or PremiumReadingBody. */
const REQUIRED = [
  "components/ChatWindow.tsx",
  "components/ChatMessageRenderer.tsx",
  "components/PremiumReadingBody.tsx",
  "components/PhotoReadingFlow.tsx",
  "components/PremiumEnergyBlock.tsx",
  "components/DailyEnergyBlock.tsx",
  "components/GuestTripletDraw.tsx",
  "components/cabinet/CabinetDailySpreads.tsx",
  "components/cabinet/CabinetPhotoSpreads.tsx",
  "components/natal/AstrologyWorkspace.tsx",
  "components/natal/NatalCompatibility.tsx",
  "components/natal/PrintableReport.tsx",
  "components/ritual/RitualCard.tsx",
  "components/numerolog/DestinyMatrixPreview.tsx",
  "app/share/[token]/page.tsx",
  "app/reports/shared/[token]/page.tsx",
  "app/joint-reading/[token]/page.tsx",
  "app/diary/page.tsx",
];

const PREMIUM_IMPORT =
  /from\s+["']@\/components\/(?:PremiumReadingBody|ChatMessageRenderer)["']|formatPremiumReadingForDisplay/;

const failures = [];

function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

for (const rel of REQUIRED) {
  const abs = join(SRC, rel);
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    failures.push(`missing file: ${rel}`);
    continue;
  }
  if (rel.endsWith("ChatMessageRenderer.tsx")) {
    assert(/formatPremiumReadingForDisplay/.test(text), `${rel} must call formatPremiumReadingForDisplay`);
    continue;
  }
  if (rel.endsWith("PremiumReadingBody.tsx")) {
    assert(/ChatMessageRenderer/.test(text), `${rel} must wrap ChatMessageRenderer`);
    continue;
  }
  assert(PREMIUM_IMPORT.test(text), `${rel} must use PremiumReadingBody or ChatMessageRenderer`);
}

/** Flag leftover wall-of-text patterns in known report pages. */
const SUSPECT_FILES = [
  "app/share/[token]/page.tsx",
  "app/reports/shared/[token]/page.tsx",
  "app/joint-reading/[token]/page.tsx",
  "components/natal/PrintableReport.tsx",
  "components/natal/AstrologyWorkspace.tsx",
];

for (const rel of SUSPECT_FILES) {
  const text = readFileSync(join(SRC, rel), "utf8");
  assert(
    !/whitespace-pre-wrap/.test(text) || /SupportChat|role === "user"/.test(text),
    `${rel} still has whitespace-pre-wrap for report body`
  );
  assert(!/toParagraphs\(/.test(text), `${rel} still uses toParagraphs instead of premium body`);
}

if (failures.length) {
  console.error("verify-premium-reading-surfaces FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log(`verify-premium-reading-surfaces OK (${REQUIRED.length} surfaces)`);
