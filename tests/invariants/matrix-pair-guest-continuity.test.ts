/**
 * P1.1B: guest Matrix pair compatibility continuity — same dates/score after stub claim.
 */
import { createHash } from "crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, recordAccountLegalConsent } from "@/lib/accounts";
import { query } from "@/lib/db";
import {
  claimGuestMatrixPairPending,
  createGuestMatrixPairPending,
  createMatrixPairGuestClaimToken,
  getMatrixPairGuestPendingMeta,
  hashMatrixPairGuestClaimToken,
} from "@/lib/services/matrix-pair-guest-service";
import { buildMatrixCompatFreeSummary } from "@/lib/numerology/matrix-compat-free-summary";
import { MATRIX_CALCULATION_VERSION } from "@/lib/numerology/destiny-matrix";
import {
  ensureMinimalConsumerProfile,
  getUserById,
  profileHasBirthData,
  updateUserProfile,
} from "@/lib/users";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { countSpendTransactions } from "./db/fixtures";
import { PRICING } from "@/lib/config/pricing";

const ROOT = path.resolve(__dirname, "../..");

describe.skipIf(!hasTestDb)("matrix-pair-guest-continuity (db)", () => {
  installDbLifecycle();

  beforeEach(async () => {
    await query(`DELETE FROM matrix_pair_guest_pending`);
  });

  it("P1: guest persist stores hash only; raw token not in DB/payload", async () => {
    const { rawClaimToken, payload } = await createGuestMatrixPairPending({
      dateA: "1990-01-01",
      dateB: "1992-06-15",
      nameA: "Аня",
      nameB: "Игорь",
    });

    expect(payload.pendingId).toBeTruthy();
    expect(payload.dateA).toBe("1990-01-01");
    expect(payload.dateB).toBe("1992-06-15");
    expect(payload.preview.methodology).toBe("zovus");
    expect(payload.preview.score).toBeGreaterThan(0);
    expect(payload.preview.strengths.length).toBeGreaterThan(0);
    expect(payload.preview.tensions.length).toBeGreaterThan(0);
    expect(payload.preview.zones.length).toBe(3);
    expect(JSON.stringify(payload)).not.toContain(rawClaimToken);
    expect(JSON.stringify(payload)).not.toMatch(/claim_token|claimTokenHash/);

    const meta = await getMatrixPairGuestPendingMeta(payload.pendingId);
    expect(meta).toBeTruthy();
    expect(meta!.claimedUserId).toBeNull();
    expect(meta!.claimTokenHash).toBe(hashMatrixPairGuestClaimToken(rawClaimToken));
    expect(meta!.claimTokenHash).not.toBe(rawClaimToken);

    const { rows } = await query<{ claim_token_hash: string; compat_snapshot: unknown }>(
      `SELECT claim_token_hash, compat_snapshot FROM matrix_pair_guest_pending WHERE id = $1`,
      [payload.pendingId]
    );
    expect(rows[0]?.claim_token_hash).not.toMatch(/^[0-9a-f]{48}$/);
    expect(JSON.stringify(rows[0])).not.toContain(rawClaimToken);
  });

  it("P2+P3: stub claim restores SAME pair + score; no rune spend / no paid report", async () => {
    const local = buildMatrixCompatFreeSummary("1991-06-15", "1988-03-03");
    expect(local).toBeTruthy();

    const { rawClaimToken, payload } = await createGuestMatrixPairPending({
      dateA: "1991-06-15",
      dateB: "1988-03-03",
    });
    expect(payload.preview.score).toBe(local!.score);

    const account = await createUser(`matrix-pair-stub-${Date.now()}@example.com`, "hash", "Пара");
    await recordAccountLegalConsent(account.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const stub = await ensureMinimalConsumerProfile({
      accountId: account.id,
      name: "Пара",
    });
    expect(profileHasBirthData(stub)).toBe(false);

    const spendBefore = await countSpendTransactions(stub.id);
    const claim = await claimGuestMatrixPairPending({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    expect(claim.dateA).toBe("1991-06-15");
    expect(claim.dateB).toBe("1988-03-03");
    expect(claim.score).toBe(payload.preview.score);
    expect(claim.preview.score).toBe(payload.preview.score);
    expect(claim.preview.strengths).toEqual(payload.preview.strengths);
    expect(claim.preview.tensions).toEqual(payload.preview.tensions);
    expect(claim.calculationVersion).toBe(MATRIX_CALCULATION_VERSION);

    const refreshed = await getUserById(stub.id);
    expect(profileHasBirthData(refreshed)).toBe(true);
    expect(String(refreshed!.birth_date).slice(0, 10)).toBe("1991-06-15");

    const spendAfter = await countSpendTransactions(stub.id);
    expect(spendAfter).toBe(spendBefore);

    const { rows: reports } = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM numerology_report_history WHERE user_id = $1`,
      [stub.id]
    );
    expect(Number(reports[0]?.c ?? 0)).toBe(0);

    const replay = await claimGuestMatrixPairPending({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.status).toBe("idempotent");
      expect(replay.score).toBe(payload.preview.score);
      expect(replay.dateA).toBe(claim.dateA);
      expect(replay.dateB).toBe(claim.dateB);
    }
  });

  it("P4: foreign / invalid / expired / id-only denied", async () => {
    const { rawClaimToken, payload } = await createGuestMatrixPairPending({
      dateA: "1992-03-03",
      dateB: "1994-04-04",
    });

    const accountA = await createUser(`matrix-pair-a-${Date.now()}@example.com`, "hash", "А");
    await recordAccountLegalConsent(accountA.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const userA = await ensureMinimalConsumerProfile({
      accountId: accountA.id,
      name: "А",
    });
    expect(
      (
        await claimGuestMatrixPairPending({
          profileUserId: userA.id,
          rawClaimToken,
        })
      ).ok
    ).toBe(true);

    const accountB = await createUser(`matrix-pair-b-${Date.now()}@example.com`, "hash", "Б");
    await recordAccountLegalConsent(accountB.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const userB = await ensureMinimalConsumerProfile({
      accountId: accountB.id,
      name: "Б",
    });
    const foreign = await claimGuestMatrixPairPending({
      profileUserId: userB.id,
      rawClaimToken,
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.code).toBe("ALREADY_CLAIMED");

    const bad = await claimGuestMatrixPairPending({
      profileUserId: userB.id,
      rawClaimToken: createMatrixPairGuestClaimToken(),
    });
    expect(bad.ok).toBe(false);

    const fakeFromId = createHash("sha256").update(payload.pendingId).digest("hex").slice(0, 48);
    const idOnly = await claimGuestMatrixPairPending({
      profileUserId: userB.id,
      rawClaimToken: fakeFromId,
    });
    expect(idOnly.ok).toBe(false);

    const { rawClaimToken: expiredToken, payload: expiredPayload } =
      await createGuestMatrixPairPending({
        dateA: "1993-05-05",
        dateB: "1995-06-06",
      });
    await query(
      `UPDATE matrix_pair_guest_pending SET expires_at = NOW() - interval '1 hour' WHERE id = $1`,
      [expiredPayload.pendingId]
    );
    const expired = await claimGuestMatrixPairPending({
      profileUserId: userB.id,
      rawClaimToken: expiredToken,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.code).toBe("EXPIRED");
  });

  it("P5: conflict then explicit replace; matching birth claims cleanly", async () => {
    const account = await createUser(`matrix-pair-c-${Date.now()}@example.com`, "hash", "К");
    await recordAccountLegalConsent(account.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const stub = await ensureMinimalConsumerProfile({
      accountId: account.id,
      name: "К",
    });
    await updateUserProfile(stub.id, {
      name: "К",
      gender: "female",
      birthDate: "1985-02-02",
      zodiac: "Водолей",
    });

    const { rawClaimToken, payload } = await createGuestMatrixPairPending({
      dateA: "1990-01-01",
      dateB: "1991-02-02",
    });
    const blocked = await claimGuestMatrixPairPending({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("MATRIX_PROFILE_CONFLICT");

    const replaced = await claimGuestMatrixPairPending({
      profileUserId: stub.id,
      rawClaimToken,
      confirmReplace: true,
    });
    expect(replaced.ok).toBe(true);
    if (replaced.ok) {
      expect(replaced.dateA).toBe("1990-01-01");
      expect(replaced.score).toBe(payload.preview.score);
    }

    const matchAccount = await createUser(`matrix-pair-m-${Date.now()}@example.com`, "hash", "М");
    await recordAccountLegalConsent(matchAccount.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const matchStub = await ensureMinimalConsumerProfile({
      accountId: matchAccount.id,
      name: "М",
    });
    await updateUserProfile(matchStub.id, {
      name: "М",
      gender: "female",
      birthDate: "1990-01-01",
      zodiac: "Козерог",
    });
    const { rawClaimToken: matchToken } = await createGuestMatrixPairPending({
      dateA: "1990-01-01",
      dateB: "1992-07-07",
    });
    const matched = await claimGuestMatrixPairPending({
      profileUserId: matchStub.id,
      rawClaimToken: matchToken,
    });
    expect(matched.ok).toBe(true);
  });

  it("contracts: paid MATRIX_PAIR_REPORT untouched; middleware guest-only; no birth in CTA URL", () => {
    expect(PRICING.MATRIX_PAIR_REPORT).toBe(30);

    const claimRoute = readFileSync(
      path.join(ROOT, "src/app/api/numerology/matrix-pair-claim/route.ts"),
      "utf8"
    );
    expect(claimRoute).toMatch(/resolveProfileUserContext/);
    expect(claimRoute).not.toMatch(/spendRunes|BillingService|chargeRune/);
    expect(claimRoute).not.toMatch(/actionType:\s*["']MATRIX_PAIR_REPORT["']/);

    const readingRoute = readFileSync(path.join(ROOT, "src/app/api/reading/route.ts"), "utf8");
    expect(readingRoute).toMatch(/MATRIX_PAIR_REPORT/);

    const middleware = readFileSync(path.join(ROOT, "src/middleware.ts"), "utf8");
    expect(middleware).toMatch(/\/api\/numerology\/matrix-pair-guest/);
    expect(middleware).not.toMatch(/\/api\/numerology\/matrix-pair-claim/);

    const preview = readFileSync(
      path.join(ROOT, "src/components/numerolog/MatrixCompatibilityPreview.tsx"),
      "utf8"
    );
    expect(preview).toMatch(/resumePair=1/);
    expect(preview).toMatch(/buildRegisterHref/);
    expect(preview).not.toMatch(/dateA=\$\{|dateB=\$\{|birthDate=\$\{/);
    expect(preview).toMatch(/методике Zovus|методика Zovus/);
  });
});
