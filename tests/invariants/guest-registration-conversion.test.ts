/**
 * Guest → registration conversion funnel invariants (P0).
 * Pure / unit-level: no live OAuth. Server claim/redraw covered elsewhere.
 */
import { describe, expect, it } from "vitest";
import {
  TEASER_MAX_CHARS,
  TEASER_MAX_TOKENS,
  TEASER_MIN_CHARS,
  TEASER_RECEIPT_MIN_AGE_MS,
  truncateTeaserText,
  validateGuestTeaserQuality,
} from "@/lib/guest-triplet-teaser-service";
import {
  profileGenderForPersonalization,
  profileHasBirthData,
} from "@/lib/users";
import { sanitizeReturnTo } from "@/lib/safe-redirect";
import { buildLandingOfferCopy } from "@/lib/landing-offer";
import {
  GUEST_RESUME_RETRY_CTA,
  GUEST_RESUME_TRANSITION_SUBTITLE,
  GUEST_RESUME_TRANSITION_TITLE,
} from "@/lib/guest-triplet-resume";
import type { RuneConfig } from "@/lib/settings";

describe("guest-registration-conversion", () => {
  it("teaser receipt min age is a short consistency window, not a 3s UX delay", () => {
    expect(TEASER_RECEIPT_MIN_AGE_MS).toBeLessThanOrEqual(1000);
    expect(TEASER_RECEIPT_MIN_AGE_MS).toBeGreaterThan(0);
  });

  it("teaser limits target conversion length (~250–500 chars)", () => {
    expect(TEASER_MAX_CHARS).toBeLessThanOrEqual(500);
    expect(TEASER_MAX_CHARS).toBeGreaterThanOrEqual(400);
    expect(TEASER_MIN_CHARS).toBeGreaterThanOrEqual(100);
    expect(TEASER_MAX_TOKENS).toBeLessThanOrEqual(160);
    const long = `${"Ситуация уже не про вспышку обиды. ".repeat(8)}Луна, Тройка Мечей и Колесница. ${"Хвост полного разбора. ".repeat(20)}`;
    expect(long.length).toBeGreaterThan(TEASER_MAX_CHARS);
    const clipped = truncateTeaserText(long);
    expect(clipped.length).toBeLessThanOrEqual(TEASER_MAX_CHARS);
    expect(clipped.length).toBeLessThan(long.length);
    // Quality path truncates first — overlong LLM dumps are clipped, not accepted raw.
    const quality = validateGuestTeaserQuality(clipped, ["Луна", "Тройка Мечей", "Колесница"]);
    if (quality.ok) {
      expect(clipped.length).toBeLessThanOrEqual(TEASER_MAX_CHARS);
    }
  });

  it("stub profile without birth is not birth-complete; ISO date is", () => {
    expect(profileHasBirthData({ birth_date: null })).toBe(false);
    expect(profileHasBirthData({ birth_date: "" })).toBe(false);
    expect(profileHasBirthData({ birthDate: "1990-05-12" })).toBe(true);
    expect(profileHasBirthData({ birth_date: "1990-05-12T00:00:00.000Z" })).toBe(true);
  });

  it("genderUnspecified stubs do not personalize as female", () => {
    expect(
      profileGenderForPersonalization({
        gender: "female",
        astro_meta: { genderUnspecified: true, stubProfile: true },
      })
    ).toBeNull();
    expect(
      profileGenderForPersonalization({
        gender: "male",
        astro_meta: { stubProfile: true },
      })
    ).toBe("male");
  });

  it("ensureMinimalConsumerProfile does not hardcode ageConfirmed true", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/users.ts", "utf8")
    );
    expect(src).toContain("mergeConsentIntoAstroMeta");
    expect(src).toContain("never invents ageConfirmed");
    expect(src).not.toMatch(/ageConfirmed:\s*true,\s*\n\s*ageConfirmedAt:\s*now/);
  });

  it("migration 124 rollback docs forbid sentinel birth dates", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("scripts/migrations/124_migrate_users_birth_optional.sql", "utf8")
    );
    expect(src).toContain("Do NOT backfill NULL with '1900-01-01'");
    expect(src).not.toMatch(/UPDATE users SET birth_date = '1900-01-01'/);
  });

  it("sanitizeReturnTo rejects external open redirects", () => {
    expect(sanitizeReturnTo("https://evil.example/phish", "/")).toBe("/");
    expect(sanitizeReturnTo("//evil.example", "/")).toBe("/");
    expect(sanitizeReturnTo("/?ask=1", "/")).toContain("/");
  });

  it("landing offer copy keeps no-registration microcopy and free CTA", () => {
    const offer = buildLandingOfferCopy(
      { enabled: true, freeQuestions: 3, costs: { READING: 10 } } as RuneConfig,
      (n) => `${n}`,
      undefined,
      "a"
    );
    expect(offer.primaryCta.toLowerCase()).toContain("бесплатно");
    expect(offer.heroMicrocopy.toLowerCase()).toContain("без регистрации");
    expect(offer.heroTitle.toLowerCase()).toContain("таро");
  });

  it("consumer UI copy must not use legacy gate labels", async () => {
    const fs = await import("node:fs/promises");
    const guest = await fs.readFile("src/components/GuestTripletDraw.tsx", "utf8");
    const auth = await fs.readFile("src/components/AuthForm.tsx", "utf8");
    expect(guest).not.toContain("Сохранить расклад и продолжить");
    expect(guest).toContain("Получить трактовку");
    expect(guest).toContain("Получить полный разбор");
    expect(guest).toContain("showAuthGate");
    expect(auth).not.toContain("Аккаунт для сохранения истории");
    expect(auth).toContain("Создать аккаунт и открыть разбор");
  });

  it("post-auth success skips onboarding redirect when guest cards present", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/client-user-auth-success.ts", "utf8")
    );
    expect(src).toContain("never insert birth onboarding");
    expect(src).toMatch(/if \(hasGuestCards\)/);
  });

  it("guest resume bootstrap does not require birth date", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/hooks/useOnboardingFlow.ts", "utf8")
    );
    expect(src).toContain("Linked profile (stub ok)");
    expect(src).not.toMatch(/if \(!hasBirth \|\| !hasServerProfile\)/);
    expect(src).toContain("forceProfileOnboarding");
  });

  it("topic cards start guest spread without auth gate", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/components/AuraSellingLanding.tsx", "utf8")
    );
    expect(src).toContain("startGuestSpread(intent.questionTemplate");
    expect(src).not.toContain("Guest topic cards → login/register");
  });

  it("practices classic Tarot is guest-open, not register-gated", async () => {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile("src/lib/editorial-landing-content.ts", "utf8");
    const practices = await fs.readFile(
      "src/components/editorial/EditorialPracticesSection.tsx",
      "utf8"
    );
    expect(content).toMatch(/id:\s*"tarot"[\s\S]*?guestHref:/);
    expect(practices).toContain("onGuestTarot");
  });

  it("home flow bootstrap does not force birth onboarding for stub profiles", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/hooks/useHomeFlow.ts", "utf8")
    );
    expect(src).toContain("Missing birth is progressive profile completion");
    expect(src).toContain('guest.tarotCards.length >= 3 ? "masters"');
  });

  it("resume copy uses recovery language, not technical jargon", () => {
    expect(GUEST_RESUME_TRANSITION_TITLE).toContain("Восстанавливаем");
    expect(GUEST_RESUME_TRANSITION_SUBTITLE.toLowerCase()).toContain("карты уже выбраны");
    expect(GUEST_RESUME_RETRY_CTA).toContain("восстановить");
  });

  it("claim route creates stub profile without requiring birth", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/app/api/guest-triplet/claim/route.ts", "utf8")
    );
    expect(src).toContain("ensureMinimalConsumerProfile");
    expect(src).toContain("Birth is NOT required");
  });

  it("natal chart APIs use birth profile context", async () => {
    const fs = await import("node:fs/promises");
    const natal = await fs.readFile("src/app/api/natal-chart/route.ts", "utf8");
    const forecast = await fs.readFile("src/app/api/natal-chart/forecast/route.ts", "utf8");
    expect(natal).toContain("resolveBirthProfileUserContext");
    expect(forecast).toContain("resolveBirthProfileUserContext");
  });

  it("metrika separates registration_completed from profile_completion", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/seo/metrika.ts", "utf8")
    );
    expect(src).toMatch(/profile_completion_started|profile_completed/);
    expect(src).toContain("registration_account_created");
    expect(src).toContain("registration_completed");
  });
});
