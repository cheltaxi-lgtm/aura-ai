/**
 * Behavioral: ensureMinimalConsumerProfile must not invent ageConfirmed,
 * and claim must preserve the same cards without requiring birth_date.
 */
import { describe, expect, it } from "vitest";
import { createUser, recordAccountLegalConsent } from "@/lib/accounts";
import { isUserAgeEligible } from "@/lib/age-gate";
import { claimGuestResumeSession } from "@/lib/guest-triplet-receipt-db";
import {
  ensureMinimalConsumerProfile,
  getUserById,
  profileGenderForPersonalization,
  profileHasBirthData,
} from "@/lib/users";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { issueGuestReceipt, SAMPLE_SYMBOLS, GUEST_PRIMARY_BINDING } from "./db/fixtures";

describe.skipIf(!hasTestDb)("guest-stub-profile-authority (db)", () => {
  installDbLifecycle();

  it("age-confirmed account → stub copies consent; Tarot claim same cards without birth", async () => {
    const account = await createUser(
      `stub-age-ok-${Date.now()}@example.com`,
      "hash",
      "Анна"
    );
    await recordAccountLegalConsent(account.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });

    const stub = await ensureMinimalConsumerProfile({
      accountId: account.id,
      name: "Анна",
    });

    expect(profileHasBirthData(stub)).toBe(false);
    expect(stub.birth_date).toBeNull();
    const meta = stub.astro_meta as {
      ageConfirmed?: boolean;
      genderUnspecified?: boolean;
      stubProfile?: boolean;
    };
    expect(meta.stubProfile).toBe(true);
    expect(meta.ageConfirmed).toBe(true);
    expect(meta.genderUnspecified).toBe(true);
    expect(profileGenderForPersonalization(stub)).toBeNull();
    expect(isUserAgeEligible(stub)).toBe(true);

    const issued = await issueGuestReceipt({ symbols: SAMPLE_SYMBOLS });
    const claim = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: stub.id,
      ...GUEST_PRIMARY_BINDING,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    const claimed = [...claim.payload.symbols].sort((a, b) => a.position - b.position);
    for (let i = 0; i < 3; i++) {
      expect(claimed[i].id).toBe(SAMPLE_SYMBOLS[i].id);
      expect(claimed[i].position).toBe(SAMPLE_SYMBOLS[i].position);
      expect(claimed[i].reversed).toBe(SAMPLE_SYMBOLS[i].reversed);
    }
  });

  it("account WITHOUT age confirmation → stub must not invent ageConfirmed=true", async () => {
    const account = await createUser(
      `stub-age-missing-${Date.now()}@example.com`,
      "hash",
      "Гость"
    );

    const stub = await ensureMinimalConsumerProfile({
      accountId: account.id,
      name: "Гость",
    });

    const meta = stub.astro_meta as { ageConfirmed?: boolean };
    expect(meta.ageConfirmed).not.toBe(true);
    expect(isUserAgeEligible(stub)).toBe(false);
    expect(profileHasBirthData(stub)).toBe(false);
  });

  it("known OAuth gender is personalization fact; unknown is not", async () => {
    const knownAccount = await createUser(
      `stub-gender-known-${Date.now()}@example.com`,
      "hash",
      "Иван"
    );
    await recordAccountLegalConsent(knownAccount.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const known = await ensureMinimalConsumerProfile({
      accountId: knownAccount.id,
      name: "Иван",
      gender: "male",
      genderKnown: true,
    });
    expect(profileGenderForPersonalization(known)).toBe("male");
    expect((known.astro_meta as { genderUnspecified?: boolean }).genderUnspecified).not.toBe(true);

    const unknownAccount = await createUser(
      `stub-gender-unknown-${Date.now()}@example.com`,
      "hash",
      "Гость"
    );
    await recordAccountLegalConsent(unknownAccount.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const unknown = await ensureMinimalConsumerProfile({
      accountId: unknownAccount.id,
      name: "Гость",
    });
    expect(unknown.gender).toBe("female"); // schema filler only
    expect(profileGenderForPersonalization(unknown)).toBeNull();
  });

  it("empty token claim does not mint a free reading / owned resume", async () => {
    const account = await createUser(
      `stub-empty-claim-${Date.now()}@example.com`,
      "hash",
      "Гость"
    );
    await recordAccountLegalConsent(account.id, {
      ageConfirmed: true,
      acceptedTerms: true,
    });
    const stub = await ensureMinimalConsumerProfile({
      accountId: account.id,
      name: "Гость",
    });
    const claim = await claimGuestResumeSession({
      token: "",
      profileUserId: stub.id,
      bindingOk: true,
    });
    expect(claim.ok).toBe(false);
    const reloaded = await getUserById(stub.id);
    expect(reloaded?.birth_date ?? null).toBeNull();
  });
});
