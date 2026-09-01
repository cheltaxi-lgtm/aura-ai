/**
 * Palm archive — ownership, unpaid-dedupe, kill-switch, cookie isolation.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("palm-archive", () => {
  it("list and detail queries are ownership-scoped", () => {
    const archive = read("src/lib/palm-reading-archive.ts");
    expect(archive).toContain("WHERE h.user_id = $1 AND h.context_data->>'type' = 'palm_reading'");
    expect(archive).toContain("s.claimed_user_id = $1");
    expect(archive).toContain("h.id = $1 AND h.user_id = $2 AND h.context_data->>'type' = 'palm_reading'");
    expect(archive).toContain("s.id = $1 AND s.claimed_user_id = $2");
  });

  it("delete is ownership-scoped and cascades snapshot → linked report", () => {
    const archive = read("src/lib/palm-reading-archive.ts");
    expect(archive).toMatch(
      /DELETE FROM history\s+WHERE id = \$1 AND user_id = \$2 AND context_data->>'type' = 'palm_reading'/
    );
    expect(archive).toMatch(
      /DELETE FROM palm_guest_snapshots\s+WHERE id = \$1 AND claimed_user_id = \$2/
    );
    expect(archive).toMatch(
      /DELETE FROM history\s+WHERE user_id = \$1[\s\S]*?palmSnapshotId' = \$2/
    );
  });

  it("unpaid archive entries never satisfy the paid-report dedupe", () => {
    const route = read("src/app/api/palm/report/route.ts");
    expect(route).toContain('typeof existing.context_data.report === "string"');
    expect(route).toContain('typeof existingAfterCharge.context_data.report === "string"');
  });

  it("archive endpoints require auth and honor the kill-switch", () => {
    const list = read("src/app/api/palm/readings/route.ts");
    const detail = read("src/app/api/palm/readings/[id]/route.ts");
    for (const src of [list, detail]) {
      expect(src).toContain("isPalmReadingEnabled()");
      expect(src).toContain("requireUserAuth()");
      expect(src).toContain('enforcePaidRouteRateLimit(auth.sub, "palm_readings")');
    }
  });

  it("product flow lists archive rows and can delete the current snapshot", () => {
    const flow = read("src/components/palm/PalmReadingFlow.tsx");
    expect(flow).toContain('fetch("/api/palm/readings"');
    expect(flow).toContain('method: "DELETE"');
    expect(flow).toContain("resetAll()");
    expect(flow).toContain("Ваши ладони");
    expect(flow).toContain("aura-past__delete");
    expect(flow).toContain("К ладоням");
  });

  it("delete of a history row also removes the linked snapshot", () => {
    const archive = read("src/lib/palm-reading-archive.ts");
    expect(archive).toContain("RETURNING context_data");
    expect(archive).toContain("linkedSnapshotId");
  });

  it("today reuse and paid cache are scoped per hand", () => {
    const guest = read("src/lib/services/palm-guest-service.ts");
    const persist = read("src/lib/palm-reading-persist.ts");
    const teaser = read("src/app/api/palm/teaser/route.ts");
    const report = read("src/app/api/palm/report/route.ts");
    expect(guest).toContain("snapshot->>'whichHand' = $2");
    expect(persist).toContain("context_data->'snapshot'->>'whichHand' = $2");
    expect(teaser).toContain("findTodaysPalmSnapshotForUser(profileUserId, whichHand)");
    expect(teaser).toContain("findTodaysPalmSnapshotByClaimToken(claimToken, whichHand)");
    expect(guest).toContain("stored.snapshot.whichHand !== whichHand");
    expect(report).toContain("findTodaysPaidPalmReport(profileUserId, snapshot.whichHand)");
    expect(report).toContain("`day:${palmCalendarDayKey()}:${snapshot.whichHand}`");
  });

  it("cabinet palm rows come from the shared archive", () => {
    const cabinet = read("src/lib/cabinet-data.ts");
    expect(cabinet).toContain("listPalmArchive(profileUserId)");
    expect(cabinet).toContain("palmSnapshotForClient(entry.snapshot, entry.paid, entry.report)");
  });

  it("unpaid archive detail and cabinet never ship lines or mounts", () => {
    const constants = read("src/lib/palm-constants.ts");
    const detail = read("src/app/api/palm/readings/[id]/route.ts");
    expect(constants).toContain("export function palmSnapshotForClient");
    expect(constants).toContain("toPalmTeaserSnapshot");
    expect(detail).toContain("palmSnapshotForClient(entry.snapshot, entry.paid, entry.report)");
  });

  it("palm guest claim never writes tarot or aura cookies", () => {
    const cookie = read("src/lib/palm-guest-claim-cookie.ts");
    const teaser = read("src/app/api/palm/teaser/route.ts");
    const claim = read("src/app/api/palm/claim/route.ts");
    expect(cookie).toContain('PALM_GUEST_CLAIM_COOKIE = "zovus_palm_guest_claim"');
    expect(cookie).not.toContain("zovus_guest_resume");
    expect(cookie).not.toContain("aura_guest_claim");
    expect(cookie).not.toContain("zovus_aura_guest_claim");
    expect(teaser).toContain("setPalmGuestClaimCookieOnResponse");
    expect(claim).toContain("readPalmGuestClaimCookie");
    for (const src of [teaser, claim]) {
      expect(src).not.toContain("zovus_guest_resume");
      expect(src).not.toContain("aura_guest_claim");
      expect(src).not.toContain("setGuestBindingCookie");
      expect(src).not.toContain("setGuestResumeCookie");
    }
  });

  it("feature gate fail-closed defaults palm off", () => {
    const gate = read("src/lib/platform-feature-gate.ts");
    expect(gate).toContain("palmReadingEnabled: false");
    expect(gate).toContain("palmReadingEnabled: data.palmReadingEnabled === true");
  });
});
