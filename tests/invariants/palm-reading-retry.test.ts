/**
 * Palm paid report — billing retry and snapshot-bound charge keys.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("palm-reading-retry", () => {
  it("report route binds charge keys to the requested snapshot", () => {
    const route = read("src/app/api/palm/report/route.ts");
    expect(route).toContain("bindPalmChargeIdempotencyKey(snapshotId, clientIdempotencyKey)");
    expect(route).not.toContain("idempotencyKey || `palm-reading:${snapshotId}`");
    expect(route).toContain("palmSpendKeyForSnapshot(snapshotId)");
    expect(route).toContain("getPalmChargeReuseState");
    expect(route).toMatch(/priorState && !priorState\.refunded/);
  });

  it("history lookup never matches another snapshot via a reused key", () => {
    const persist = read("src/lib/palm-reading-persist.ts");
    expect(persist).toContain("ctxSnapshot !== snapshotId");
    expect(persist).toContain("palmSpendKeyBelongsToSnapshot(ctxKey, snapshotId)");
  });

  it("unpaid archive/cabinet stay on the teaser subset", () => {
    const detail = read("src/app/api/palm/readings/[id]/route.ts");
    const cabinet = read("src/lib/cabinet-data.ts");
    expect(detail).toContain("palmSnapshotForClient");
    expect(cabinet).toContain("palmSnapshotForClient");
  });
});
