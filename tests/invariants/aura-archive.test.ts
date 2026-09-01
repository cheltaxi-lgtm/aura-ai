/**
 * Aura archive (past readings) — ownership and billing-safety invariants.
 *
 *  1. Every archive read/delete is scoped to the owner (user_id / claimed_user_id).
 *  2. Unpaid snapshot entries never satisfy the paid-report dedupe — the report
 *     route still requires a string `report` in the cached entry.
 *  3. The archive endpoints stay behind auth + the aura kill-switch.
 *  4. Deleting a snapshot cascades to its linked history report (no orphans
 *     that would resurrect a paid report after the user wiped it).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("aura-archive", () => {
  it("list and detail queries are ownership-scoped", () => {
    const archive = read("src/lib/aura-reading-archive.ts");
    expect(archive).toContain("WHERE user_id = $1");
    expect(archive).toContain("s.claimed_user_id = $1");
    expect(archive).toContain("s.id = $1 AND s.claimed_user_id = $2");
    expect(archive).toContain("WHERE id = $1 AND user_id = $2");
  });

  it("delete is ownership-scoped and cascades snapshot → linked report", () => {
    const archive = read("src/lib/aura-reading-archive.ts");
    expect(archive).toMatch(
      /DELETE FROM aura_guest_snapshots\s+WHERE id = \$1 AND claimed_user_id = \$2/
    );
    expect(archive).toMatch(
      /DELETE FROM history\s+WHERE user_id = \$1[\s\S]*?auraSnapshotId' = \$2/
    );
  });

  it("unpaid archive entries never satisfy the paid-report dedupe", () => {
    const route = read("src/app/api/aura/report/route.ts");
    // Cached-report shortcut requires a finished string report.
    expect(route).toContain('typeof existing.context_data.report === "string"');
    expect(route).toContain('typeof existingAfterCharge.context_data.report === "string"');
  });

  it("archive endpoints require auth and honor the kill-switch", () => {
    const list = read("src/app/api/aura/readings/route.ts");
    const detail = read("src/app/api/aura/readings/[id]/route.ts");
    for (const src of [list, detail]) {
      expect(src).toContain("isAuraReadingEnabled()");
      expect(src).toContain("requireUserAuth()");
      expect(src).toContain('enforcePaidRouteRateLimit(auth.sub, "aura_readings")');
    }
  });

  it("cabinet aura rows come from the shared archive (paid + unpaid)", () => {
    const cabinet = read("src/lib/cabinet-data.ts");
    expect(cabinet).toContain("listAuraArchive(profileUserId)");
    expect(cabinet).toContain("subjectName: entry.subjectName");
  });
});
