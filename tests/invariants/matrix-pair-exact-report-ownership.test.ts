/**
 * P2.5B: Matrix pair full-report ownership is exact current pair, not any compatibility row.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, recordAccountLegalConsent } from "@/lib/accounts";
import { query } from "@/lib/db";
import { PRICING } from "@/lib/config/pricing";
import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
import {
  hasOwnedMatrixPairForPending,
  matrixPairHistoryOwnsCurrentPair,
  matrixPairReportOwnsCurrentPair,
  partnerDateFromPairStructuredData,
} from "@/lib/numerology/matrix-pair-ownership";
import {
  claimGuestMatrixPairPending,
  createGuestMatrixPairPending,
  getMatrixPairGuestPendingMeta,
} from "@/lib/services/matrix-pair-guest-service";
import { ensureSelfSubject } from "@/lib/services/matrix-subject-service";
import {
  ensureMinimalConsumerProfile,
  updateUserProfile,
} from "@/lib/users";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("matrix-pair-exact-report-ownership", () => {
  it("A: matching pair + report → owned", () => {
    expect(
      matrixPairReportOwnsCurrentPair(
        [{ birthDate: "1990-01-01", partnerDate: "1992-06-15" }],
        { dateA: "1990-01-01", dateB: "1992-06-15" }
      )
    ).toBe(true);
  });

  it("B: report for another pair → not owned", () => {
    expect(
      matrixPairReportOwnsCurrentPair(
        [{ birthDate: "1990-01-01", partnerDate: "1992-06-15" }],
        { dateA: "1990-01-01", dateB: "1988-03-03" }
      )
    ).toBe(false);
  });

  it("C: several reports — only the exact pair wins; roles are not swapped", () => {
    const reports = [
      { birthDate: "1990-01-01", partnerDate: "1992-06-15" },
      { birthDate: "1990-01-01", partnerDate: "1985-12-31" },
      { birthDate: "1988-03-03", partnerDate: "1990-01-01" },
    ];
    expect(
      matrixPairReportOwnsCurrentPair(reports, {
        dateA: "1990-01-01",
        dateB: "1985-12-31",
      })
    ).toBe(true);
    expect(
      matrixPairReportOwnsCurrentPair(reports, {
        dateA: "1990-01-01",
        dateB: "1999-01-01",
      })
    ).toBe(false);
    expect(
      matrixPairReportOwnsCurrentPair(reports, {
        dateA: "1992-06-15",
        dateB: "1990-01-01",
      })
    ).toBe(false);
    expect(
      matrixPairHistoryOwnsCurrentPair(
        [{ birthDate: "1990-01-01", partnerDate: "1992-06-15" }],
        { dateA: "1990-01-01", dateB: "1992-06-15" }
      )
    ).toBe(true);
    expect(partnerDateFromPairStructuredData({ partnerDate: "15.06.1992" })).toBe(
      "1992-06-15"
    );
  });

  it("does not treat any compatibility report as current-pair ownership", () => {
    const pair = read("src/components/numerolog/MatrixCompatibilityPreview.tsx");
    expect(pair).toMatch(/\/api\/numerology\/matrix-pair-owned\?pendingId=/);
    expect(pair).not.toMatch(/\/api\/numerology\/matrix-report\?birthDate=/);
    expect(pair).toMatch(/freeToPaidFunnelState\(ownedPair\)/);
    expect(pair).toMatch(
      /trackProductFunnel\("paid_cta", \{\s*product: "matrix_compatibility",\s*source: "pair_full",\s*state: freeToPaidFunnelState\(ownedPair\),\s*\}\)/
    );
  });

  it("G: MATRIX_PAIR_REPORT stays 30 ᚢ on the new-pair path", () => {
    expect(PRICING.MATRIX_PAIR_REPORT).toBe(30);
    expect(DEFAULT_RUNE_COSTS.MATRIX_PAIR_REPORT).toBe(30);
    const reading = read("src/app/api/reading/route.ts");
    expect(reading).toMatch(
      /if \(toolId === "matrix_compatibility"\) return "MATRIX_PAIR_REPORT"/
    );
    expect(read("src/lib/free-to-paid-conversion.ts")).toMatch(
      /runeAction:\s*"MATRIX_PAIR_REPORT"/
    );
  });
});

describe.skipIf(!hasTestDb)("matrix-pair-exact-report-ownership (db)", () => {
  installDbLifecycle();

  beforeEach(async () => {
    await query(`DELETE FROM numerology_report_history`);
    await query(`DELETE FROM matrix_pair_guest_pending`);
    await query(`DELETE FROM matrix_subjects`);
    await query(`DELETE FROM history`);
  });

  async function seedUser(label: string, birthDate: string) {
    const account = await createUser(
      `pair-own-${label}-${Date.now()}@example.com`,
      "hash",
      label
    );
    await recordAccountLegalConsent(account.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const user = await ensureMinimalConsumerProfile({
      accountId: account.id,
      name: label,
    });
    await updateUserProfile(user.id, {
      name: label,
      gender: "female",
      birthDate,
      birthCity: "Moscow",
      zodiac: "Козерог",
    });
    const self = await ensureSelfSubject(user.id);
    expect(self).toBeTruthy();
    return { user, self: self! };
  }

  async function insertPairReport(opts: {
    userId: string;
    subjectId: string;
    dateA: string;
    dateB: string;
    version?: string;
  }) {
    await query(
      `INSERT INTO numerology_report_history (
         user_id, tool_id, subject_id, birth_date, calculation_version, content,
         structured_data
       ) VALUES (
         $1, 'matrix_compatibility', $2::uuid, $3::date, $4, $5, $6::jsonb
       )`,
      [
        opts.userId,
        opts.subjectId,
        opts.dateA,
        opts.version ?? "matrix-v3",
        "полный купленный разбор пары",
        JSON.stringify({ partnerDate: opts.dateB }),
      ]
    );
  }

  it("A: paid report for this pair → owned", async () => {
    const { rawClaimToken: _t, payload } = await createGuestMatrixPairPending({
      dateA: "1990-01-01",
      dateB: "1992-06-15",
    });
    const { user, self } = await seedUser("A", "1990-01-01");
    await insertPairReport({
      userId: user.id,
      subjectId: self.id,
      dateA: "1990-01-01",
      dateB: "1992-06-15",
    });
    expect(
      await hasOwnedMatrixPairForPending({
        userId: user.id,
        pendingId: payload.pendingId,
      })
    ).toBe(true);
  });

  it("B: paid report for another pair → not owned", async () => {
    const { payload } = await createGuestMatrixPairPending({
      dateA: "1990-01-01",
      dateB: "1988-03-03",
    });
    const { user, self } = await seedUser("B", "1990-01-01");
    await insertPairReport({
      userId: user.id,
      subjectId: self.id,
      dateA: "1990-01-01",
      dateB: "1992-06-15",
    });
    expect(
      await hasOwnedMatrixPairForPending({
        userId: user.id,
        pendingId: payload.pendingId,
      })
    ).toBe(false);
  });

  it("C: matching pair is selected among several reports", async () => {
    const pairAB = await createGuestMatrixPairPending({
      dateA: "1990-01-01",
      dateB: "1992-06-15",
    });
    const pairAC = await createGuestMatrixPairPending({
      dateA: "1990-01-01",
      dateB: "1985-12-31",
    });
    const { user, self } = await seedUser("C", "1990-01-01");
    await insertPairReport({
      userId: user.id,
      subjectId: self.id,
      dateA: "1990-01-01",
      dateB: "1992-06-15",
      version: "matrix-v3",
    });
    await query(
      `INSERT INTO matrix_subjects (user_id, kind, display_name, birth_date)
       VALUES ($1, 'partner', 'Другая', '1985-12-31')`,
      [user.id]
    );
    const partner = await query<{ id: string }>(
      `SELECT id FROM matrix_subjects WHERE user_id = $1 AND kind = 'partner' LIMIT 1`,
      [user.id]
    );
    await insertPairReport({
      userId: user.id,
      subjectId: partner.rows[0]!.id,
      dateA: "1990-01-01",
      dateB: "1985-12-31",
      version: "matrix-v3-alt",
    });

    expect(
      await hasOwnedMatrixPairForPending({
        userId: user.id,
        pendingId: pairAB.payload.pendingId,
      })
    ).toBe(true);
    expect(
      await hasOwnedMatrixPairForPending({
        userId: user.id,
        pendingId: pairAC.payload.pendingId,
      })
    ).toBe(true);

    const pairAD = await createGuestMatrixPairPending({
      dateA: "1990-01-01",
      dateB: "1970-01-01",
    });
    expect(
      await hasOwnedMatrixPairForPending({
        userId: user.id,
        pendingId: pairAD.payload.pendingId,
      })
    ).toBe(false);
  });

  it("D: guest claim keeps the same pair identity for ownership", async () => {
    const { rawClaimToken, payload } = await createGuestMatrixPairPending({
      dateA: "1991-06-15",
      dateB: "1988-03-03",
    });
    const before = await getMatrixPairGuestPendingMeta(payload.pendingId);
    const { user, self } = await seedUser("D", "1991-06-15");
    const claim = await claimGuestMatrixPairPending({
      profileUserId: user.id,
      rawClaimToken,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    expect(claim.pendingId).toBe(payload.pendingId);
    expect(claim.dateA).toBe("1991-06-15");
    expect(claim.dateB).toBe("1988-03-03");

    const after = await getMatrixPairGuestPendingMeta(payload.pendingId);
    expect(after!.claimedUserId).toBe(user.id);
    expect(after!.dateA).toBe(before!.dateA);
    expect(after!.dateB).toBe(before!.dateB);

    expect(
      await hasOwnedMatrixPairForPending({
        userId: user.id,
        pendingId: payload.pendingId,
      })
    ).toBe(false);

    await insertPairReport({
      userId: user.id,
      subjectId: self.id,
      dateA: after!.dateA,
      dateB: after!.dateB,
    });
    expect(
      await hasOwnedMatrixPairForPending({
        userId: user.id,
        pendingId: payload.pendingId,
      })
    ).toBe(true);
  });

  it("E: another user cannot read foreign pair ownership", async () => {
    const { payload } = await createGuestMatrixPairPending({
      dateA: "1992-03-03",
      dateB: "1990-01-01",
    });
    const owner = await seedUser("E-own", "1992-03-03");
    const other = await seedUser("E-other", "1992-03-03");
    await insertPairReport({
      userId: owner.user.id,
      subjectId: owner.self.id,
      dateA: "1992-03-03",
      dateB: "1990-01-01",
    });
    expect(
      await hasOwnedMatrixPairForPending({
        userId: other.user.id,
        pendingId: payload.pendingId,
      })
    ).toBe(false);

    await query(
      `UPDATE matrix_pair_guest_pending SET claimed_user_id = $2, claimed_at = NOW() WHERE id = $1`,
      [payload.pendingId, owner.user.id]
    );
    expect(
      await hasOwnedMatrixPairForPending({
        userId: other.user.id,
        pendingId: payload.pendingId,
      })
    ).toBe(false);
    expect(
      await hasOwnedMatrixPairForPending({
        userId: owner.user.id,
        pendingId: payload.pendingId,
      })
    ).toBe(true);
  });

  it("F: invalid / expired pair identity is safe owned=false", async () => {
    const { user } = await seedUser("F", "1990-01-01");
    expect(
      await hasOwnedMatrixPairForPending({
        userId: user.id,
        pendingId: "not-a-uuid",
      })
    ).toBe(false);
    expect(
      await hasOwnedMatrixPairForPending({
        userId: user.id,
        pendingId: "00000000-0000-0000-0000-000000000000",
      })
    ).toBe(false);

    const { payload } = await createGuestMatrixPairPending({
      dateA: "1990-01-01",
      dateB: "1992-06-15",
    });
    await query(
      `UPDATE matrix_pair_guest_pending SET expires_at = NOW() - interval '1 hour' WHERE id = $1`,
      [payload.pendingId]
    );
    await query(`DELETE FROM matrix_pair_guest_pending WHERE id = $1`, [
      payload.pendingId,
    ]);
    expect(
      await hasOwnedMatrixPairForPending({
        userId: user.id,
        pendingId: payload.pendingId,
      })
    ).toBe(false);
  });
});
