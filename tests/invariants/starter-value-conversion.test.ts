import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";

const ROOT = path.resolve(__dirname, "../..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("starter 300ᚢ conversion pass — shared layer", () => {
  it("product prices stay unchanged in code defaults", () => {
    expect(DEFAULT_RUNE_COSTS.VISION_ANALYSIS).toBe(30);
    expect(DEFAULT_RUNE_COSTS.HD_REPORT).toBe(300);
    expect(DEFAULT_RUNE_COSTS.HD_COMPOSITE_REPORT).toBe(300);
    expect(DEFAULT_RUNE_COSTS.NATAL_READING).toBe(300);
    expect(DEFAULT_RUNE_COSTS.NUMEROLOGY_SESSION).toBe(100);
    expect(DEFAULT_RUNE_COSTS.MATRIX_PAIR_REPORT).toBe(30);
    expect(DEFAULT_RUNE_COSTS.READING).toBe(15);
  });

  it("StarterRunesValue is display-only and never grants entitlement", () => {
    const src = readSrc("src/components/auth/StarterRunesValue.tsx");
    // No entitlement authority: no storage, no balance writes, no grant calls.
    expect(src).not.toMatch(/localStorage|sessionStorage/);
    expect(src).not.toMatch(/rune_balance|grantStarter|chargeRune|spendRune/);
    // No hardcoded starter amount or product price — everything from server config.
    expect(src).not.toMatch(/starterRunes\s*=\s*\d{2,}/);
    expect(src).not.toContain("₽");
  });

  it("StarterRunesValue hides the welcome promise from authenticated users", () => {
    const src = readSrc("src/components/auth/StarterRunesValue.tsx");
    expect(src).toContain('from "@/lib/useAuth"');
    expect(src).toMatch(/!authLoading && !isLoggedIn/);
  });

  it("StarterRunesValue takes product prices from live server config via costKey", () => {
    const src = readSrc("src/components/auth/StarterRunesValue.tsx");
    expect(src).toContain("costKey?: RuneActionType");
    expect(src).toContain("config.costs[costKey]");
  });

  it("StarterRunesValue fires starter_value_view with product context", () => {
    const src = readSrc("src/components/auth/StarterRunesValue.tsx");
    expect(src).toContain('trackSeoEvent("starter_value_view"');
    expect(src).toContain("product:");
  });
});

describe("starter 300ᚢ conversion pass — product placements", () => {
  it("HD report guest block shows contextual starter value next to the 300ᚢ price", () => {
    const src = readSrc("src/components/human-design/HdReportPanel.tsx");
    const guestBlock = src.slice(src.indexOf("if (!authenticated)"));
    expect(guestBlock).toContain('costKey="HD_REPORT"');
    expect(guestBlock).toContain('product="hd_report"');
    // Price display itself is unchanged.
    expect(src).toContain("formatRunesWithRub(reportCost)");
  });

  it("HD composite shows starter value only when a real purchase is required", () => {
    const src = readSrc("src/components/human-design/HdComposite.tsx");
    expect(src).toContain('costKey="HD_COMPOSITE_REPORT"');
    // Hidden in the free-resume state («без списания»).
    expect(src).toMatch(/!resumeFree[\s\S]{0,200}StarterRunesValue/);
  });

  it("Matrix destiny preview shows starter value to logged-out users", () => {
    const src = readSrc("src/components/numerolog/DestinyMatrixPreview.tsx");
    expect(src).toContain('costKey="NUMEROLOGY_SESSION"');
    expect(src).toMatch(/!isLoggedIn[\s\S]{0,300}StarterRunesValue/);
  });

  it("Matrix pair preview shows starter value to logged-out users", () => {
    const src = readSrc("src/components/numerolog/MatrixCompatibilityPreview.tsx");
    expect(src).toContain('costKey="MATRIX_PAIR_REPORT"');
    expect(src).toMatch(/!isLoggedIn[\s\S]{0,300}StarterRunesValue/);
  });

  it("Natal guest calculator shows starter value to logged-out users", () => {
    const src = readSrc("src/components/natal/NatalGuestCalculator.tsx");
    expect(src).toContain('costKey="NATAL_READING"');
    expect(src).toMatch(/!isLoggedIn[\s\S]{0,300}StarterRunesValue/);
  });

  it("Tarot guest auth gate shows a generic starter line without touching card logic", () => {
    const src = readSrc("src/components/GuestTripletDraw.tsx");
    expect(src).toContain('StarterRunesValue variant="badge" generic product="tarot_guest"');
    // P0: no redraw, receipt flow untouched by this pass.
    expect(src).toContain("Карты зафиксированы — пересчёта не будет");
  });

  it("HD calculator page splits the free/paid copy contradiction", () => {
    const src = readSrc("src/app/dizayn-cheloveka/rasschitat/page.tsx");
    expect(src).toContain("карта и основные параметры — бесплатно и без регистрации;");
    expect(src).not.toContain("бесплатно и без регистрации — разбор с Эвелиной после входа.");
    // Price hint comes from code defaults, not a magic number.
    expect(src).toContain("DEFAULT_RUNE_COSTS.HD_REPORT");
    // SEO: URL and H1 intent unchanged.
    expect(src).toContain('path: "/dizayn-cheloveka/rasschitat"');
    expect(src).toContain("Рассчитать карту Дизайна Человека");
  });

  it("auth screen analytics distinguish product contexts", () => {
    const src = readSrc("src/components/AuthForm.tsx");
    expect(src).toContain('trackSeoEvent("photo_auth_view")');
    expect(src).toContain('trackSeoEvent("starter_auth_view"');
    expect(src).toContain('safe.includes("dizayn-cheloveka")');
    expect(src).toContain('safe.includes("natalnaya-karta")');
    expect(src).toContain('safe.includes("numerology")');
  });

  it("register screen hero supports product contexts via returnTo", () => {
    const src = readSrc("src/components/auth/StarterRunesValue.tsx");
    expect(src).toContain('returnTo.includes("dizayn-cheloveka")');
    expect(src).toContain('returnTo.includes("natalnaya-karta")');
    expect(src).toContain('returnTo.includes("numerology")');
    // Photo context from the Photo Conversion Pass is preserved.
    expect(src).toContain('returnTo.includes("photo=1")');
  });
});

describe("starter gift on the public homepage", () => {
  it("gift section renders real server prices only — no hardcoded amounts", () => {
    const src = readSrc("src/components/editorial/EditorialStarterGiftSection.tsx");
    // Prices and starter amount come from the live server config.
    expect(src).toContain("config.costs[example.costKey]");
    expect(src).toContain("config.starterRunes");
    expect(src).not.toMatch(/starterRunes\s*=\s*\d{2,}/);
    // No ruble conversion in the gift copy.
    expect(src).not.toContain("₽");
    // Products costing more than the starter package get partial-coverage framing.
    expect(src).toContain("вклад в стоимость");
  });

  it("gift section is display-only and hidden from authenticated users", () => {
    const src = readSrc("src/components/editorial/EditorialStarterGiftSection.tsx");
    expect(src).toContain('from "@/lib/useAuth"');
    expect(src).toMatch(/fromServer && config\.starterRunes > 0 && !authLoading && !isLoggedIn/);
    // No entitlement authority: no storage, no balance writes, no grant calls.
    expect(src).not.toMatch(/localStorage|sessionStorage/);
    expect(src).not.toMatch(/rune_balance|grantStarter|chargeRune|spendRune/);
  });

  it("gift CTA leads to the existing register flow", () => {
    const src = readSrc("src/components/editorial/EditorialStarterGiftSection.tsx");
    expect(src).toContain("buildRegisterHref");
    expect(src).toContain("Создать аккаунт и получить {starter} ᚢ");
    expect(src).toContain('trackSeoEvent("starter_gift_cta_click"');
    expect(src).toContain('trackSeoEvent("starter_gift_view"');
  });

  it("gift section is the unified acquisition block after the demo on the guest homepage", () => {
    const src = readSrc("src/components/AuraSellingLanding.tsx");
    const start = src.indexOf("if (isGuestEditorial)");
    const guestReturn = src.indexOf("return (", start);
    const nextReturn = src.indexOf("return (", guestReturn + 1);
    const guestBranch = src.slice(guestReturn, nextReturn);
    const demoIdx = guestBranch.indexOf("<LandingDemoSection");
    const giftIdx = guestBranch.indexOf("<EditorialStarterGiftSection");
    const stepsIdx = guestBranch.indexOf("<EditorialSessionStepsSection");
    expect(demoIdx).toBeGreaterThan(-1);
    expect(giftIdx).toBeGreaterThan(demoIdx);
    expect(giftIdx).toBeLessThan(stepsIdx);
    expect(guestBranch).not.toContain("<EditorialFreeValueSection");
    expect(guestBranch).not.toContain("<EditorialStarterPackSection");
  });

  it("hero shows the compact starter accent to guests near the main CTA", () => {
    const src = readSrc("src/components/editorial/EditorialHeroSection.tsx");
    expect(src).toContain('StarterRunesValue variant="line" generic product="home_hero"');
    expect(src).toContain("guestConversion");
  });

  it("no second starter-grant mechanism was created", () => {
    // The only grant call sites remain the pre-existing server-side ones.
    const gift = readSrc("src/components/editorial/EditorialStarterGiftSection.tsx");
    const hero = readSrc("src/components/editorial/EditorialHeroSection.tsx");
    const landing = readSrc("src/components/AuraSellingLanding.tsx");
    for (const src of [gift, hero, landing]) {
      expect(src).not.toContain("grantStarterRunesIfNeeded");
    }
  });
});
