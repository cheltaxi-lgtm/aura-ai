/**
 * Regression guard for /?ask&spread=1 guest SEO entry.
 * Catches the class of bug introduced by 3400ddd (register wall instead of GuestTriplet).
 *
 * Matrix (static + pure card-continuity simulator):
 * 1. no receipt → new draw path (GuestTriplet start)
 * 2. active receipt → same cards, no new pick
 * 3. claimed receipt → same cards, resume reading, no new pick
 * 4. expired/invalid → new draw path (documented)
 *
 * Fail mode: VERIFY_SEO_ASK_SPREAD_FAIL_ON_SWAP=1 artificially swaps cards and must fail.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function section(name: string) {
  console.log(`\n== ${name} ==`);
}

type CardIds = [number, number, number];

/** Pure continuity check used by steps 2/3 vs baseline step 1. */
export function assertSameCardIds(baseline: CardIds, next: CardIds, label: string): void {
  assert.deepEqual(
    next,
    baseline,
    `${label}: card IDs diverged — baseline=${baseline.join(",")} next=${next.join(",")}`
  );
}

/** Simulate SEO matrix outcomes from HomePage routing contract. */
export function simulateSeoAskSpreadMatrix(input: {
  hasActiveReceipt: boolean;
  receiptStatus: "none" | "issued" | "claimed" | "reading_consumed" | "expired" | "invalid";
  baselineCards: CardIds;
  /** When set, pretend a redraw produced these IDs (must fail continuity). */
  redrawCards?: CardIds;
}): {
  action: "new_draw" | "keep_receipt" | "resume_claimed";
  cards: CardIds;
} {
  const { hasActiveReceipt, receiptStatus, baselineCards, redrawCards } = input;

  if (receiptStatus === "expired" || receiptStatus === "invalid" || receiptStatus === "none") {
    return { action: "new_draw", cards: redrawCards ?? baselineCards };
  }

  if (receiptStatus === "claimed" || receiptStatus === "reading_consumed") {
    const cards = redrawCards ?? baselineCards;
    assertSameCardIds(baselineCards, cards, "claimed/consumed continuity");
    return { action: "resume_claimed", cards };
  }

  // issued + active UI intent
  if (hasActiveReceipt && receiptStatus === "issued") {
    const cards = redrawCards ?? baselineCards;
    assertSameCardIds(baselineCards, cards, "active receipt continuity");
    return { action: "keep_receipt", cards };
  }

  return { action: "new_draw", cards: redrawCards ?? baselineCards };
}

section("static: middleware allows guest teaser without JWT");
{
  const mw = readSrc("src/middleware.ts");
  assert.ok(
    mw.includes('"/api/guest-triplet/teaser"'),
    "teaser must be in PUBLIC_API_EXACT (else middleware returns Unauthorized)"
  );
}

section("static: HomePage routes guest ask/spread to GuestTriplet");
{
  const home = readSrc("src/components/HomePage.tsx");
  assert.ok(
    home.includes("signalGuestSpreadStart"),
    "must dispatch GuestTriplet start"
  );
  assert.ok(home.includes("hasActiveGuestResumeIntent"), "must guard active receipt");
  assert.ok(home.includes('spreadParam === "1"') || home.includes("spreadParam === '1'"));
  assert.ok(home.includes("trackGuestTripletRedrawPrevented"));

  // Guest without receipt must NOT open paid SEO wall for bare spread=1
  const spreadBlock = home.slice(home.indexOf("Bare /?ask&spread=1"));
  assert.ok(spreadBlock.includes("signalGuestSpreadStart"));
  assert.ok(
    !spreadBlock.slice(0, 900).includes("setSeoFlowOpen(true)"),
    "guest spread=1 must not open MasterSessionFlow wall"
  );

  // ask-param guest branch must start GuestTriplet
  const askIdx = home.indexOf("Guest SEO/deep-link");
  assert.ok(askIdx > 0, "guest SEO ask deep-link comment/branch missing");
  const askBlock = home.slice(askIdx, askIdx + 800);
  assert.ok(askBlock.includes("signalGuestSpreadStart"));
}

section("matrix row 1: no receipt → new draw");
{
  const r = simulateSeoAskSpreadMatrix({
    hasActiveReceipt: false,
    receiptStatus: "none",
    baselineCards: [10, 20, 30],
  });
  assert.equal(r.action, "new_draw");
}

section("matrix row 2: active receipt → same cards, keep");
{
  const baseline: CardIds = [55, 4, 31];
  const r = simulateSeoAskSpreadMatrix({
    hasActiveReceipt: true,
    receiptStatus: "issued",
    baselineCards: baseline,
  });
  assert.equal(r.action, "keep_receipt");
  assertSameCardIds(baseline, r.cards, "row2");
}

section("matrix row 3: claimed → same cards, resume");
{
  const baseline: CardIds = [63, 36, 54];
  const r = simulateSeoAskSpreadMatrix({
    hasActiveReceipt: false,
    receiptStatus: "claimed",
    baselineCards: baseline,
  });
  assert.equal(r.action, "resume_claimed");
  assertSameCardIds(baseline, r.cards, "row3");
}

section("matrix row 4: expired/invalid → new draw (documented)");
{
  const expired = simulateSeoAskSpreadMatrix({
    hasActiveReceipt: false,
    receiptStatus: "expired",
    baselineCards: [1, 2, 3],
    redrawCards: [7, 8, 9],
  });
  assert.equal(expired.action, "new_draw");
  assert.deepEqual(expired.cards, [7, 8, 9]);

  const invalid = simulateSeoAskSpreadMatrix({
    hasActiveReceipt: false,
    receiptStatus: "invalid",
    baselineCards: [1, 2, 3],
    redrawCards: [11, 12, 13],
  });
  assert.equal(invalid.action, "new_draw");
}

section("continuity fail mode (must throw when cards swapped)");
{
  const baseline: CardIds = [55, 4, 31];
  let threw = false;
  try {
    simulateSeoAskSpreadMatrix({
      hasActiveReceipt: true,
      receiptStatus: "issued",
      baselineCards: baseline,
      redrawCards: [99, 98, 97],
    });
  } catch {
    threw = true;
  }
  assert.ok(threw, "continuity check must fail when redraw swaps card IDs");

  if (process.env.VERIFY_SEO_ASK_SPREAD_FAIL_ON_SWAP === "1") {
    // Explicit red run for CI proof — rethrow
    simulateSeoAskSpreadMatrix({
      hasActiveReceipt: true,
      receiptStatus: "issued",
      baselineCards: baseline,
      redrawCards: [99, 98, 97],
    });
  }
}

console.log("\nverify-seo-ask-spread: OK");
console.log(
  "Documented row4: expired/invalid receipt → new_draw (HomePage hasActiveGuestResumeIntent false → GuestTriplet start)."
);
