/**
 * P1.0: guest Natal continuity — same server artifact after stub claim.
 */
import { createHash } from "crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, recordAccountLegalConsent } from "@/lib/accounts";
import { query } from "@/lib/db";
import {
  claimGuestNatalChart,
  createGuestNatalChart,
  createNatalGuestClaimToken,
  getGuestNatalArtifactMeta,
  hashNatalGuestClaimToken,
} from "@/lib/services/natal-guest-service";
import { getStoredNatalChart } from "@/lib/services/natal-chart-service";
import {
  ensureMinimalConsumerProfile,
  getUserById,
  profileHasBirthData,
  updateUserProfile,
} from "@/lib/users";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { countSpendTransactions } from "./db/fixtures";

const ROOT = path.resolve(__dirname, "../..");

const MOSCOW = {
  label: "Moscow, Moscow, Russia",
  latitude: 55.7558,
  longitude: 37.6173,
  timezone: "Europe/Moscow",
};

async function ensureNatalEnabled() {
  await query(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ('natalChart', '{"enabled":true,"ephemeris":"celestine"}'::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = COALESCE(platform_settings.value, '{}'::jsonb) ||
       '{"enabled":true}'::jsonb,
       updated_at = NOW()`
  );
}

describe.skipIf(!hasTestDb)("natal-guest-continuity (db)", () => {
  installDbLifecycle();

  beforeEach(async () => {
    await query(`DELETE FROM natal_guest_charts`);
    await query(`DELETE FROM natal_charts`);
  });

  it("N1+N3: guest calc persists artifact; raw token not in DB", async () => {
    await ensureNatalEnabled();
    const { rawClaimToken, payload } = await createGuestNatalChart({
      birthDate: "1990-01-01",
      birthTime: "12:30",
      timeKnown: true,
      place: MOSCOW,
    });

    expect(payload.artifactId).toBeTruthy();
    expect(payload.timeKnown).toBe(true);
    expect(payload.western).toBeTruthy();
    expect(payload.highlights.length).toBeGreaterThan(0);
    expect(payload).not.toHaveProperty("birthFingerprint");
    const publicJson = JSON.stringify(payload);
    expect(publicJson).not.toContain("birthFingerprint");
    expect(publicJson).not.toContain(rawClaimToken);
    expect(publicJson).not.toMatch(/claim_token|claimTokenHash|userId/);

    const meta = await getGuestNatalArtifactMeta(payload.artifactId);
    expect(meta).toBeTruthy();
    expect(meta!.claimedUserId).toBeNull();
    expect(meta!.claimTokenHash).toBe(hashNatalGuestClaimToken(rawClaimToken));
    expect(meta!.claimTokenHash).not.toBe(rawClaimToken);
    expect(JSON.stringify(meta!.chartData)).not.toContain(rawClaimToken);

    const { rows } = await query<{ claim_token_hash: string; chart_data: unknown }>(
      `SELECT claim_token_hash, chart_data FROM natal_guest_charts WHERE id = $1`,
      [payload.artifactId]
    );
    expect(rows[0]?.claim_token_hash).not.toMatch(/^[0-9a-f]{48}$/);
    expect(JSON.stringify(rows[0])).not.toContain(rawClaimToken);
  });

  it("N2: unknown time — no authoritative ASC/MC/houses in safe payload", async () => {
    await ensureNatalEnabled();
    const { payload } = await createGuestNatalChart({
      birthDate: "1990-01-01",
      birthTime: null,
      timeKnown: false,
      place: MOSCOW,
    });
    expect(payload.timeKnown).toBe(false);
    expect(payload.western?.rising).toBeUndefined();
    expect(payload.western?.midheaven).toBeUndefined();
    expect(payload.western?.houses).toBeUndefined();
    expect(payload.positions.every((p) => p.key !== "rising" && p.key !== "midheaven")).toBe(
      true
    );
    expect(payload.positions.every((p) => p.house == null)).toBe(true);
  });

  it("N4+N5+N13: stub claim adopts SAME artifact; no rune spend", async () => {
    await ensureNatalEnabled();
    const { rawClaimToken, payload } = await createGuestNatalChart({
      birthDate: "1991-06-15",
      birthTime: "08:15",
      timeKnown: true,
      place: MOSCOW,
    });
    const guestMeta = await getGuestNatalArtifactMeta(payload.artifactId);
    expect(guestMeta).toBeTruthy();

    const account = await createUser(`natal-stub-${Date.now()}@example.com`, "hash", "Натал");
    await recordAccountLegalConsent(account.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const stub = await ensureMinimalConsumerProfile({
      accountId: account.id,
      name: "Натал",
    });
    expect(profileHasBirthData(stub)).toBe(false);

    const spendBefore = await countSpendTransactions(stub.id);
    const claim = await claimGuestNatalChart({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    expect(claim.birthFingerprint).toBe(guestMeta!.birthFingerprint);
    expect(claim.artifactId).toBe(payload.artifactId);
    expect(payload).not.toHaveProperty("birthFingerprint");

    const owned = await getStoredNatalChart(stub.id);
    expect(owned).toBeTruthy();
    expect(owned!.birthFingerprint).toBe(guestMeta!.birthFingerprint);
    expect(owned!.engineVersion).toBe(guestMeta!.engineVersion);
    expect(owned!.timeKnown).toBe(true);
    // Exact chart continuity (western sun longitude).
    const guestSun = (guestMeta!.chartData.western as { sun?: { longitude?: number } })?.sun
      ?.longitude;
    const ownedSun = (owned!.western as { sun?: { longitude?: number } })?.sun?.longitude;
    expect(ownedSun).toBe(guestSun);

    const refreshed = await getUserById(stub.id);
    expect(profileHasBirthData(refreshed)).toBe(true);
    expect(String(refreshed!.birth_date).slice(0, 10)).toBe("1991-06-15");

    const spendAfter = await countSpendTransactions(stub.id);
    expect(spendAfter).toBe(spendBefore);

    const replay = await claimGuestNatalChart({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.status).toBe("idempotent");
  });

  it("N6: matching existing profile claims idempotently", async () => {
    await ensureNatalEnabled();
    const account = await createUser(`natal-match-${Date.now()}@example.com`, "hash", "Совпад");
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
      birthTime: "12:30",
      birthCity: "Moscow",
      zodiac: "Козерог",
    });

    const { rawClaimToken, payload } = await createGuestNatalChart({
      birthDate: "1990-01-01",
      birthTime: "12:30",
      timeKnown: true,
      place: MOSCOW,
    });

    const claim = await claimGuestNatalChart({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    const meta = await getGuestNatalArtifactMeta(payload.artifactId);
    expect(claim.birthFingerprint).toBe(meta!.birthFingerprint);
    expect(payload).not.toHaveProperty("birthFingerprint");
  });

  it("N7+N8: conflict then explicit replace adopts guest chart", async () => {
    await ensureNatalEnabled();
    const account = await createUser(`natal-conflict-${Date.now()}@example.com`, "hash", "Конфликт");
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
      birthTime: "10:00",
      birthCity: "Челябинск",
      zodiac: "Водолей",
    });

    const { rawClaimToken, payload } = await createGuestNatalChart({
      birthDate: "1990-01-01",
      birthTime: "12:30",
      timeKnown: true,
      place: MOSCOW,
    });

    const blocked = await claimGuestNatalChart({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.code).toBe("NATAL_PROFILE_CONFLICT");

    const userMid = await getUserById(stub.id);
    expect(String(userMid!.birth_date).slice(0, 10)).toBe("1985-02-02");
    const guestStill = await getGuestNatalArtifactMeta(payload.artifactId);
    expect(guestStill!.claimedUserId).toBeNull();

    const replaced = await claimGuestNatalChart({
      profileUserId: stub.id,
      rawClaimToken,
      confirmReplace: true,
    });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.birthFingerprint).toBe(guestStill!.birthFingerprint);

    const userAfter = await getUserById(stub.id);
    expect(String(userAfter!.birth_date).slice(0, 10)).toBe("1990-01-01");
    const owned = await getStoredNatalChart(stub.id);
    expect(owned!.birthFingerprint).toBe(guestStill!.birthFingerprint);
  });

  it("N9+N10+N11+N12: foreign / invalid / expired / id-only denied", async () => {
    await ensureNatalEnabled();
    const { rawClaimToken, payload } = await createGuestNatalChart({
      birthDate: "1992-03-03",
      birthTime: "09:00",
      timeKnown: true,
      place: MOSCOW,
    });

    const accountA = await createUser(`natal-a-${Date.now()}@example.com`, "hash", "А");
    await recordAccountLegalConsent(accountA.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const userA = await ensureMinimalConsumerProfile({
      accountId: accountA.id,
      name: "А",
    });

    const claimA = await claimGuestNatalChart({
      profileUserId: userA.id,
      rawClaimToken,
    });
    expect(claimA.ok).toBe(true);

    const accountB = await createUser(`natal-b-${Date.now()}@example.com`, "hash", "Б");
    await recordAccountLegalConsent(accountB.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const userB = await ensureMinimalConsumerProfile({
      accountId: accountB.id,
      name: "Б",
    });
    const foreign = await claimGuestNatalChart({
      profileUserId: userB.id,
      rawClaimToken,
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.code).toBe("ALREADY_CLAIMED");

    const bad = await claimGuestNatalChart({
      profileUserId: userB.id,
      rawClaimToken: createNatalGuestClaimToken(),
    });
    expect(bad.ok).toBe(false);

    // Artifact id alone (wrong token derived from id) cannot claim.
    const fakeFromId = createHash("sha256").update(payload.artifactId).digest("hex").slice(0, 48);
    const idOnly = await claimGuestNatalChart({
      profileUserId: userB.id,
      rawClaimToken: fakeFromId,
    });
    expect(idOnly.ok).toBe(false);

    // Expired
    const { rawClaimToken: expiredToken, payload: expiredPayload } =
      await createGuestNatalChart({
        birthDate: "1993-04-04",
        birthTime: "11:00",
        timeKnown: true,
        place: MOSCOW,
      });
    await query(`UPDATE natal_guest_charts SET expires_at = NOW() - interval '1 hour' WHERE id = $1`, [
      expiredPayload.artifactId,
    ]);
    const expired = await claimGuestNatalChart({
      profileUserId: userB.id,
      rawClaimToken: expiredToken,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.code).toBe("EXPIRED");
  });

  it("privacy: claim HTTP response omits birthFingerprint", () => {
    const claimRoute = readFileSync(
      path.join(ROOT, "src/app/api/natal-chart/claim/route.ts"),
      "utf8"
    );
    expect(claimRoute).not.toMatch(/birthFingerprint\s*:/);
    const safe = readFileSync(
      path.join(ROOT, "src/lib/natal/guest-free-summary.ts"),
      "utf8"
    );
    expect(safe).not.toMatch(/birthFingerprint:\s*opts\.chart/);
    expect(safe).not.toMatch(/birthFingerprint:\s*string/);
  });

  it("validation: invalid place/date rejected without creating artifact", async () => {
    await ensureNatalEnabled();
    const before = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM natal_guest_charts`
    );
    const countBefore = Number(before.rows[0]?.n ?? 0);

    await expect(
      createGuestNatalChart({
        birthDate: "1990-01-01",
        birthTime: "12:00",
        timeKnown: true,
        place: { ...MOSCOW, latitude: 91 },
      })
    ).rejects.toThrow("INVALID_PLACE");

    await expect(
      createGuestNatalChart({
        birthDate: "1990-01-01",
        birthTime: "12:00",
        timeKnown: true,
        place: { ...MOSCOW, longitude: 181 },
      })
    ).rejects.toThrow("INVALID_PLACE");

    await expect(
      createGuestNatalChart({
        birthDate: "1990-01-01",
        birthTime: "12:00",
        timeKnown: true,
        place: { ...MOSCOW, timezone: "Fake/Zone" },
      })
    ).rejects.toThrow("INVALID_PLACE");

    await expect(
      createGuestNatalChart({
        birthDate: "2020-02-31",
        birthTime: "12:00",
        timeKnown: true,
        place: MOSCOW,
      })
    ).rejects.toThrow("INVALID_BIRTH_DATE");

    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);
    const futureDate = `${future.getUTCFullYear()}-01-15`;
    await expect(
      createGuestNatalChart({
        birthDate: futureDate,
        birthTime: "12:00",
        timeKnown: true,
        place: MOSCOW,
      })
    ).rejects.toThrow("INVALID_BIRTH_DATE");

    const after = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM natal_guest_charts`
    );
    expect(Number(after.rows[0]?.n ?? 0)).toBe(countBefore);

    // Valid IANA timezone still works.
    const ok = await createGuestNatalChart({
      birthDate: "1990-01-01",
      birthTime: "12:00",
      timeKnown: true,
      place: MOSCOW,
    });
    expect(ok.payload.artifactId).toBeTruthy();
    expect(ok.payload.timezone).toBe("Europe/Moscow");
    expect(ok.payload).not.toHaveProperty("birthFingerprint");
  });
});
