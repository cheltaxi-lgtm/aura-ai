import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
import { resolveRegistrationReturnTo } from "@/lib/post-auth-return";
import { grantStarterRunesIfNeeded } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser, getUserBalance } from "./db/fixtures";

const ROOT = path.resolve(__dirname, "../..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("photo-rasklad conversion pass — starter package authority", () => {
  it("photo reading price stays 30 ᚢ in code defaults", () => {
    expect(DEFAULT_RUNE_COSTS.VISION_ANALYSIS).toBe(30);
  });

  it("starter grant is server-side, row-locked and duplicate-protected", () => {
    const src = readSrc("src/lib/rune-service.ts");
    const grantBlock = src.slice(src.indexOf("export async function grantStarterRunesIfNeeded"));
    // Row lock + flag guard + ledger check — no double granting via retry/race.
    expect(grantBlock).toContain("FOR UPDATE");
    expect(grantBlock).toContain("starter_runes_granted = FALSE");
    expect(grantBlock).toMatch(/rune_transactions[\s\S]*Стартовый пакет/);
  });

  it("every consumer registration path grants starter runes server-side", () => {
    // Email registration.
    const emailRegister = readSrc("src/app/api/auth/user/register/route.ts");
    expect(emailRegister).toContain("grantStarterRunesIfNeeded(profile.id)");
    // OAuth finish (Yandex/VK) — only for genuinely new accounts.
    const oauthFinish = readSrc("src/lib/oauth/finish.ts");
    expect(oauthFinish).toMatch(/isNewUser[\s\S]{0,200}grantStarterRunesIfNeeded/);
    // OAuth register completion.
    expect(readSrc("src/app/api/auth/oauth/register/route.ts")).toContain(
      "grantStarterRunesIfNeeded"
    );
    // Onboarding profile creation + cabinet catch-all for legacy accounts.
    expect(readSrc("src/app/api/onboarding/route.ts")).toContain("grantStarterRunesIfNeeded");
    expect(readSrc("src/app/api/cabinet/route.ts")).toContain("grantStarterRunesIfNeeded");
  });

  it("email register response exposes the server-confirmed starter amount", () => {
    const src = readSrc("src/app/api/auth/user/register/route.ts");
    expect(src).toContain("starterRunes: starterGranted");
    expect(src).toMatch(/grantStarterRunesIfNeeded\(profile\.id\)\.then/);
  });

  it("photo returnTo survives registration (/?photo=1)", () => {
    expect(resolveRegistrationReturnTo({ photo: true })).toBe("/?photo=1");
  });

  it("StarterRunesValue renders only server-loaded config — never fallback numbers", () => {
    const src = readSrc("src/components/auth/StarterRunesValue.tsx");
    expect(src).toContain("fromServer");
    expect(src).toMatch(/if \(!fromServer \|\| config\.starterRunes <= 0\) return null/);
    // Display-only: no entitlement writes, no storage, no balance mutation.
    expect(src).not.toMatch(/localStorage|sessionStorage/);
    expect(src).not.toMatch(/rune_balance|grantStarter/);
    // No hardcoded starter amount — value comes from server config.
    expect(src).not.toMatch(/starterRunes\s*=\s*\d{2,}/);
    // Runes are never priced in rubles in this copy.
    expect(src).not.toContain("₽");
  });

  it("useRuneConfig never marks fallback config as server-loaded", () => {
    const src = readSrc("src/lib/useRuneConfig.ts");
    expect(src).toContain("cachedFromServer = d !== FALLBACK");
    expect(src).toContain("fromServer");
  });

  it("starter value appears on landing, photo modal guest block and register screen", () => {
    const landing = readSrc("src/app/photo-rasklad/page.tsx");
    expect(landing).toContain('StarterRunesValue variant="badge"');

    const modal = readSrc("src/components/PhotoReadingFlow.tsx");
    // Guest-only block: the welcome promise is shown exclusively to logged-out users.
    const guestBlock = modal.slice(modal.indexOf("{!isLoggedIn && step === \"upload\" && ("));
    expect(guestBlock).toContain('StarterRunesValue variant="badge"');
    expect(guestBlock).toContain("buildRegisterHref(resolveRegistrationReturnTo({ photo: true }))");
    // Existing users get a login path instead of a new-user promise.
    expect(guestBlock).toContain("buildLoginHref(resolveRegistrationReturnTo({ photo: true }))");

    const register = readSrc("src/app/auth/user/register/page.tsx");
    expect(register).toContain('StarterRunesValue variant="hero"');
  });

  it("photo modal price line explains runes without ruble conversion", () => {
    const modal = readSrc("src/components/PhotoReadingFlow.tsx");
    expect(modal).toContain("(руны Zovus)");
    // The starter/price explanation copy must not price runes in rubles.
    const priceLine = modal.slice(modal.indexOf("Стоимость —"), modal.indexOf("Стоимость —") + 400);
    expect(priceLine).not.toContain("₽");
  });

  it("photo funnel analytics: auth view + server-confirmed starter grant events", () => {
    const authForm = readSrc("src/components/AuthForm.tsx");
    expect(authForm).toContain('trackSeoEvent("photo_auth_view")');
    expect(authForm).toContain('trackSeoEvent("starter_runes_granted"');
    const modal = readSrc("src/components/PhotoReadingFlow.tsx");
    expect(modal).toContain('trackPhotoReadingPhase("open", { mode: initialMode, authed: isLoggedIn })');
  });

  it("landing SEO-critical markup is unchanged (H1, metadata, canonical path)", () => {
    const landing = readSrc("src/app/photo-rasklad/page.tsx");
    expect(landing).toContain("Расшифровка Таро по фото онлайн");
    expect(landing).toContain('path: "/photo-rasklad"');
    expect(landing).toContain("Загрузить фото расклада");
  });
});

describe.skipIf(!hasTestDb)("starter package (db)", () => {
  installDbLifecycle();

  it("new user receives exactly one starter package; retry is a no-op", async () => {
    const settings = await getRuneSettings();
    expect(settings.starterRunes).toBeGreaterThan(0);

    const user = await createTestUser({ runeBalance: 0 });
    const first = await grantStarterRunesIfNeeded(user.id);
    expect(first).not.toBeNull();
    expect(first!.granted).toBe(settings.starterRunes);
    expect(await getUserBalance(user.id)).toBe(settings.starterRunes);

    // Callback retry / double invocation must not credit twice.
    const second = await grantStarterRunesIfNeeded(user.id);
    expect(second).toBeNull();
    expect(await getUserBalance(user.id)).toBe(settings.starterRunes);
  });

  it("existing user with prior starter ledger row is not granted again", async () => {
    const settings = await getRuneSettings();
    const user = await createTestUser({ runeBalance: 0 });
    await grantStarterRunesIfNeeded(user.id);
    const balanceAfterFirst = await getUserBalance(user.id);

    // Simulate another registration path firing (cabinet catch-all, onboarding).
    const again = await grantStarterRunesIfNeeded(user.id);
    expect(again).toBeNull();
    expect(await getUserBalance(user.id)).toBe(balanceAfterFirst);
    expect(balanceAfterFirst).toBe(settings.starterRunes);
  });
});
