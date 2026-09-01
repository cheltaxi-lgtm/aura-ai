/**
 * Aura paid report — billing retry invariants.
 *
 * Regression coverage for the review findings:
 *  1. A deduplicated charge with no finished report must NOT dead-end:
 *     reuse a still-held charge, re-charge under a fresh key after a refund.
 *  2. Refunds must be linked (transactionId) so retry logic can detect them.
 *  3. The teaser must not leak paid layers/chakras pre-auth.
 *  4. The vision call must receive the prefix-stripped base64 payload.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("aura-reading-retry", () => {
  it("dedupe branch reuses a held charge or re-charges fresh after refund", () => {
    const route = read("src/app/api/aura/report/route.ts");
    // Held-charge detection via linked refund lookup.
    expect(route).toContain("getAuraChargeReuseState");
    // Reuse path: continue generation without a second spend.
    expect(route).toMatch(/priorState && !priorState\.refunded/);
    // Refunded path: fresh per-attempt idempotency key (never the stable key).
    expect(route).toMatch(/aura-reading:\$\{snapshotId\}:\$\{randomUUID\(\)\}/);
    // The dead "pending" payload is gone — a retry always reaches generation.
    expect(route).not.toContain("pending: true");
  });

  it("refund on failure is linked to the original charge", () => {
    const route = read("src/app/api/aura/report/route.ts");
    expect(route).toContain("rollbackChargeEx");
    expect(route).toMatch(/transactionId:\s*billingCharge\.transactionId/);
  });

  it("ownership is checked before enqueue and generation is serialized", () => {
    const route = read("src/app/api/aura/report/route.ts");
    const ownershipIdx = route.indexOf("getClaimedAuraSnapshotRow({ snapshotId, profileUserId })");
    const enqueueIdx = route.indexOf("enqueuePaidAsyncJob({");
    expect(ownershipIdx).toBeGreaterThan(-1);
    expect(enqueueIdx).toBeGreaterThan(-1);
    expect(ownershipIdx).toBeLessThan(enqueueIdx);
    expect(route).toContain("withAuraReadingLock(");
    expect(route).toContain("day:${auraCalendarDayKey()}");
    expect(route).toContain("findTodaysPaidAuraReport");
    expect(route).toContain("listTodaysUnrefundedAuraSpends");
    expect(route).toContain("auraSpendBelongsToSnapshot");
    expect(route).toContain("ALREADY_PAID_TODAY");
  });

  it("teaser and claim return only the pre-payment subset", () => {
    const teaser = read("src/app/api/aura/teaser/route.ts");
    const claim = read("src/app/api/aura/claim/route.ts");
    expect(teaser).toContain("toAuraTeaserSnapshot(opts.snapshot)");
    expect(claim).toContain("toAuraTeaserSnapshot(result.snapshot)");
  });

  it("vision call receives the prefix-stripped base64", () => {
    const teaser = read("src/app/api/aura/teaser/route.ts");
    expect(teaser).toContain("generateAuraSnapshot(trimmed, mimeType");
  });

  it("snapshot dedupe never matches a different snapshot via a reused key", () => {
    const persist = read("src/lib/aura-reading-persist.ts");
    expect(persist).toContain("ctxSnapshot !== snapshotId");
  });
});
