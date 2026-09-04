import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { upsertOAuthAccount } from "@/lib/oauth/accounts";
import { getAccountConsentSnapshot } from "@/lib/accounts";
import { hasTestDb, installDbLifecycle } from "./db/setup";

describe("registration consent boundaries", () => {
  it("all registration APIs accept only an explicit boolean marketing opt-in", () => {
    for (const file of [
      "src/app/api/auth/user/register/route.ts",
      "src/app/api/auth/oauth/register/route.ts",
      "src/app/api/auth/oauth/vk/native/route.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("marketingConsent: body.marketingConsent === true");
      expect(source).not.toContain("marketingConsent: true");
    }
  });
});

describe.skipIf(!hasTestDb)("OAuth registration consent persistence", () => {
  installDbLifecycle();
  for (const consentValue of [true, false]) {
    it(`persists explicit marketingConsent=${consentValue}`, async () => {
      const now = new Date().toISOString();
      const info = { providerUserId: randomUUID(), name: "Тест", email: null, emailVerified: false };
      const consent = { termsAcceptedAt: now, ageConfirmedAt: now, marketingConsent: consentValue, marketingConsentAt: consentValue ? now : null };
      const account = await upsertOAuthAccount({ provider: "yandex", info, consent });
      const snapshot = await getAccountConsentSnapshot(account.accountId);
      expect(snapshot?.marketingConsent).toBe(consentValue);
      if (consentValue) expect(snapshot?.marketingConsentAt).toBeTruthy();
      else expect(snapshot?.marketingConsentAt).toBeNull();
      // Login without a new opt-in must not invent or revoke historical consent.
      await upsertOAuthAccount({ provider: "yandex", info, consent: { ...consent, marketingConsent: false, marketingConsentAt: null } });
      expect((await getAccountConsentSnapshot(account.accountId))?.marketingConsent).toBe(consentValue);
    });
  }
});
