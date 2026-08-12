/**
 * P1.1A: guest Matrix continuity — same date / same deterministic Matrix after stub claim.
 */
import { createHash } from "crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, recordAccountLegalConsent } from "@/lib/accounts";
import { query } from "@/lib/db";
import {
  claimGuestMatrixPending,
  createGuestMatrixPending,
  createMatrixGuestClaimToken,
  getMatrixGuestPendingMeta,
  hashMatrixGuestClaimToken,
} from "@/lib/services/matrix-guest-service";
import { destinyMatrix, MATRIX_CALCULATION_VERSION } from "@/lib/numerology/destiny-matrix";
import {
  ensureMinimalConsumerProfile,
  getUserById,
  profileHasBirthData,
  updateUserProfile,
} from "@/lib/users";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { countSpendTransactions } from "./db/fixtures";

const ROOT = path.resolve(__dirname, "../..");

describe.skipIf(!hasTestDb)("matrix-guest-continuity (db)", () => {
  installDbLifecycle();

  beforeEach(async () => {
    await query(`DELETE FROM matrix_guest_pending`);
  });

  it("M1: guest persist stores hash only; raw token not in DB/payload", async () => {
    const { rawClaimToken, payload } = await createGuestMatrixPending({
      birthDate: "1990-01-01",
      displayName: "Гость",
    });

    expect(payload.pendingId).toBeTruthy();
    expect(payload.birthDate).toBe("1990-01-01");
    expect(payload.calculationVersion).toBe(MATRIX_CALCULATION_VERSION);
    expect(payload.personalNumbers.body).toBeGreaterThan(0);
    expect(JSON.stringify(payload)).not.toContain(rawClaimToken);
    expect(JSON.stringify(payload)).not.toMatch(/claim_token|claimTokenHash|userId/);

    const meta = await getMatrixGuestPendingMeta(payload.pendingId);
    expect(meta).toBeTruthy();
    expect(meta!.claimedUserId).toBeNull();
    expect(meta!.claimTokenHash).toBe(hashMatrixGuestClaimToken(rawClaimToken));
    expect(meta!.claimTokenHash).not.toBe(rawClaimToken);

    const { rows } = await query<{ claim_token_hash: string; matrix_snapshot: unknown }>(
      `SELECT claim_token_hash, matrix_snapshot FROM matrix_guest_pending WHERE id = $1`,
      [payload.pendingId]
    );
    expect(rows[0]?.claim_token_hash).not.toMatch(/^[0-9a-f]{48}$/);
    expect(JSON.stringify(rows[0])).not.toContain(rawClaimToken);
  });

  it("M2+M3: stub claim adopts SAME date / SAME personal numbers; no rune spend", async () => {
    const { rawClaimToken, payload } = await createGuestMatrixPending({
      birthDate: "1991-06-15",
    });
    const guestMeta = await getMatrixGuestPendingMeta(payload.pendingId);
    expect(guestMeta).toBeTruthy();

    const account = await createUser(`matrix-stub-${Date.now()}@example.com`, "hash", "Матрица");
    await recordAccountLegalConsent(account.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const stub = await ensureMinimalConsumerProfile({
      accountId: account.id,
      name: "Матрица",
    });
    expect(profileHasBirthData(stub)).toBe(false);

    const spendBefore = await countSpendTransactions(stub.id);
    const claim = await claimGuestMatrixPending({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    expect(claim.birthDate).toBe("1991-06-15");
    expect(claim.subjectId).toBeTruthy();

    const refreshed = await getUserById(stub.id);
    expect(profileHasBirthData(refreshed)).toBe(true);
    expect(String(refreshed!.birth_date).slice(0, 10)).toBe("1991-06-15");

    const { rows: subjects } = await query<{ id: string; birth_date: string; kind: string }>(
      `SELECT id, birth_date::text, kind FROM matrix_subjects WHERE user_id = $1 AND kind = 'self'`,
      [stub.id]
    );
    expect(subjects[0]?.id).toBe(claim.subjectId);
    expect(String(subjects[0]?.birth_date).slice(0, 10)).toBe("1991-06-15");

    // Deterministic continuity vs frozen asOfDate from pending.
    const recomputed = destinyMatrix(claim.birthDate, { asOfDate: guestMeta!.asOfDate });
    expect(recomputed).toBeTruthy();
    const snap = guestMeta!.matrixSnapshot as Record<string, { number?: number }>;
    expect(recomputed!.body.number).toBe(snap.body?.number);
    expect(recomputed!.energy.number).toBe(snap.energy?.number);
    expect(recomputed!.money.number).toBe(snap.money?.number);
    expect(payload.personalNumbers.body).toBe(recomputed!.body.number);

    const spendAfter = await countSpendTransactions(stub.id);
    expect(spendAfter).toBe(spendBefore);

    const { rows: reports } = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM numerology_report_history WHERE user_id = $1`,
      [stub.id]
    );
    expect(Number(reports[0]?.c ?? 0)).toBe(0);

    const replay = await claimGuestMatrixPending({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.status).toBe("idempotent");
  });

  it("M4: matching existing profile claims without overwrite conflict", async () => {
    const account = await createUser(`matrix-match-${Date.now()}@example.com`, "hash", "Совпад");
    await recordAccountLegalConsent(account.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const stub = await ensureMinimalConsumerProfile({
      accountId: account.id,
      name: "Совпад",
    });
    await updateUserProfile(stub.id, {
      name: "Совпад",
      gender: "female",
      birthDate: "1990-01-01",
      zodiac: "Козерог",
    });

    const { rawClaimToken } = await createGuestMatrixPending({
      birthDate: "1990-01-01",
    });

    const claim = await claimGuestMatrixPending({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    expect(claim.birthDate).toBe("1990-01-01");
  });

  it("M5+M6: conflict then explicit replace adopts guest Matrix date", async () => {
    const account = await createUser(`matrix-conflict-${Date.now()}@example.com`, "hash", "Конфликт");
    await recordAccountLegalConsent(account.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const stub = await ensureMinimalConsumerProfile({
      accountId: account.id,
      name: "Конфликт",
    });
    await updateUserProfile(stub.id, {
      name: "Конфликт",
      gender: "female",
      birthDate: "1985-02-02",
      zodiac: "Водолей",
    });

    const { rawClaimToken, payload } = await createGuestMatrixPending({
      birthDate: "1990-01-01",
    });

    const blocked = await claimGuestMatrixPending({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.code).toBe("MATRIX_PROFILE_CONFLICT");

    const userMid = await getUserById(stub.id);
    expect(String(userMid!.birth_date).slice(0, 10)).toBe("1985-02-02");
    const guestStill = await getMatrixGuestPendingMeta(payload.pendingId);
    expect(guestStill!.claimedUserId).toBeNull();

    const replaced = await claimGuestMatrixPending({
      profileUserId: stub.id,
      rawClaimToken,
      confirmReplace: true,
    });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.birthDate).toBe("1990-01-01");

    const userAfter = await getUserById(stub.id);
    expect(String(userAfter!.birth_date).slice(0, 10)).toBe("1990-01-01");
  });

  it("M7: foreign / invalid / expired / id-only denied", async () => {
    const { rawClaimToken, payload } = await createGuestMatrixPending({
      birthDate: "1992-03-03",
    });

    const accountA = await createUser(`matrix-a-${Date.now()}@example.com`, "hash", "А");
    await recordAccountLegalConsent(accountA.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const userA = await ensureMinimalConsumerProfile({
      accountId: accountA.id,
      name: "А",
    });

    const claimA = await claimGuestMatrixPending({
      profileUserId: userA.id,
      rawClaimToken,
    });
    expect(claimA.ok).toBe(true);

    const accountB = await createUser(`matrix-b-${Date.now()}@example.com`, "hash", "Б");
    await recordAccountLegalConsent(accountB.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const userB = await ensureMinimalConsumerProfile({
      accountId: accountB.id,
      name: "Б",
    });
    const foreign = await claimGuestMatrixPending({
      profileUserId: userB.id,
      rawClaimToken,
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.code).toBe("ALREADY_CLAIMED");

    const bad = await claimGuestMatrixPending({
      profileUserId: userB.id,
      rawClaimToken: createMatrixGuestClaimToken(),
    });
    expect(bad.ok).toBe(false);

    const fakeFromId = createHash("sha256").update(payload.pendingId).digest("hex").slice(0, 48);
    const idOnly = await claimGuestMatrixPending({
      profileUserId: userB.id,
      rawClaimToken: fakeFromId,
    });
    expect(idOnly.ok).toBe(false);

    const { rawClaimToken: expiredToken, payload: expiredPayload } =
      await createGuestMatrixPending({ birthDate: "1993-04-04" });
    await query(`UPDATE matrix_guest_pending SET expires_at = NOW() - interval '1 hour' WHERE id = $1`, [
      expiredPayload.pendingId,
    ]);
    const expired = await claimGuestMatrixPending({
      profileUserId: userB.id,
      rawClaimToken: expiredToken,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.code).toBe("EXPIRED");
  });

  it("privacy/contracts: claim route + middleware + no birthDate in CTA URL helpers", () => {
    const claimRoute = readFileSync(
      path.join(ROOT, "src/app/api/numerology/matrix-claim/route.ts"),
      "utf8"
    );
    expect(claimRoute).toMatch(/resolveProfileUserContext/);
    expect(claimRoute).not.toMatch(/spendRunes|charge|NUMEROLOGY_SESSION/);

    const middleware = readFileSync(path.join(ROOT, "src/middleware.ts"), "utf8");
    expect(middleware).toMatch(/\/api\/numerology\/matrix-guest/);
    expect(middleware).not.toMatch(/\/api\/numerology\/matrix-claim/);

    const preview = readFileSync(
      path.join(ROOT, "src/components/numerolog/DestinyMatrixPreview.tsx"),
      "utf8"
    );
    expect(preview).toMatch(/resumeMatrix=1/);
    expect(preview).toMatch(/buildRegisterHref/);
    expect(preview).not.toMatch(/birthDate=\$\{/);
    expect(preview).not.toMatch(/localStorage\.setItem\([^)]*claim/);
  });
});
