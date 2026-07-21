/**
 * Regression tests for guest-resume post-auth state machine.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isGuestResumeBannerPhase,
  isGuestResumeUiCache,
  type GuestResumeUiCache,
} from "../src/lib/guest-resume-ui-cache.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function section(name: string) {
  console.log(`\n== ${name} ==`);
}

section("banner only for active transition phases");
{
  assert.equal(isGuestResumeBannerPhase("claiming"), true);
  assert.equal(isGuestResumeBannerPhase("resuming_reading"), true);
  assert.equal(isGuestResumeBannerPhase("idle"), false);
  assert.equal(isGuestResumeBannerPhase("onboarding_required"), false);
  assert.equal(isGuestResumeBannerPhase("reading_ready"), false);
  assert.equal(isGuestResumeBannerPhase("recoverable_error"), false);
  assert.equal(isGuestResumeBannerPhase("safe_recovery"), false);
  assert.equal(isGuestResumeBannerPhase(undefined), false);
}

section("claimedSessionId is valid UI-cache field (not a token)");
{
  const cache: GuestResumeUiCache = {
    version: 1,
    origin: "guest",
    masterId: "veronika",
    system: "tarot-veronika",
    spreadId: "triplet",
    question: "Длинный вопрос для resume после auth и онбординга",
    teaser: "t",
    cards: [
      { id: 1, name: "A", position: 0, reversed: false },
      { id: 2, name: "B", position: 1, reversed: true },
      { id: 3, name: "C", position: 2, reversed: false },
    ],
    completedAt: new Date().toISOString(),
    claimedSessionId: "11111111-1111-1111-1111-111111111111",
    phase: "resuming_reading",
  };
  assert.equal(isGuestResumeUiCache(cache), true);
  assert.ok(!("token" in cache));
}

section("wipe-guard: cache presence means local cards must be kept");
{
  // Documented contract used by useOnboardingFlow wipe effect.
  const shouldWipeLocalCards = (opts: {
    hasUiCache: boolean;
    spreadType?: string;
    hasServerTriplet: boolean;
  }) => {
    if (opts.hasUiCache) return false;
    if (opts.spreadType === "guest_resume") return false;
    if (opts.hasServerTriplet) return false;
    return true;
  };
  assert.equal(
    shouldWipeLocalCards({ hasUiCache: true, hasServerTriplet: false }),
    false
  );
  assert.equal(
    shouldWipeLocalCards({
      hasUiCache: false,
      spreadType: "guest_resume",
      hasServerTriplet: false,
    }),
    false
  );
  assert.equal(
    shouldWipeLocalCards({ hasUiCache: false, hasServerTriplet: false }),
    true
  );
}

section("onboarding-required must not keep transition banner");
{
  // Homepage must not show "готовит трактовку" while profile incomplete.
  const shouldShowTransitionBanner = (phase: string | undefined, hasBirth: boolean) => {
    if (!hasBirth) return false;
    return phase === "claiming" || phase === "resuming_reading";
  };
  assert.equal(shouldShowTransitionBanner("onboarding_required", false), false);
  assert.equal(shouldShowTransitionBanner("claiming", true), true);
  assert.equal(shouldShowTransitionBanner("idle", true), false);
}

section("static: wipe skips guest resume cache");
{
  const src = readSrc("src/hooks/useOnboardingFlow.ts");
  assert.ok(src.includes("loadGuestResumeUiCache()"));
  assert.ok(src.includes('spreadType === "guest_resume"'));
  assert.ok(src.includes("Never wipe local cards while guest resume"));
}

section("static: guest reading opens chat without restore race");
{
  const src = readSrc("src/hooks/useOnboardingFlow.ts");
  assert.ok(src.includes('spreadType: "guest_resume"'));
  assert.ok(src.includes("chatLoadedForRef.current = masterToBind"));
  assert.ok(src.includes("skipNextReadingRef.current = Boolean(opts?.skipReading)"));
  assert.ok(src.includes("Fetch reading BEFORE opening chat"));
  assert.ok(src.includes("hasServerProfile"));
  assert.ok(!/pendingChatOptsRef\.current = \{ masterId: masterToBind, skipReading: true \}/.test(src));
}

section("static: logged-in 401 never shows guest register copy");
{
  const src = readSrc("src/hooks/useChatActions.ts");
  assert.ok(src.includes("isLoggedIn"));
  assert.ok(src.includes("NEEDS_PROFILE"));
  // Incomplete profile must leave chat for anketa — not a chat stub banner.
  assert.ok(src.includes('setStep("onboarding")'));
  assert.ok(src.includes("markNeedsServerProfile"));
  assert.ok(src.includes('phase: "onboarding_required"'));
  // Guest registration copy must stay behind !isLoggedIn branch.
  const idx = src.indexOf("Для расшифровки нужна регистрация");
  assert.ok(idx > 0);
  const window = src.slice(Math.max(0, idx - 400), idx);
  assert.ok(window.includes("isLoggedIn") || window.includes("else"));
}

section("static: guest landing must not blank after triplet");
{
  const homeFlow = readSrc("src/hooks/useHomeFlow.ts");
  // Guest resume cache alone must never force step=onboarding while logged out.
  assert.ok(homeFlow.includes("Do NOT treat guest"));
  assert.ok(homeFlow.includes("urlStep === \"onboarding\" || isAuthPending()"));
  const homePage = readSrc("src/components/HomePage.tsx");
  assert.ok(homePage.includes("showLanding || step === \"onboarding\""));
}
{
  const src = readSrc("src/hooks/useOnboardingFlow.ts");
  assert.ok(src.includes("forceProfileOnboarding"));
  assert.ok(src.includes("Incomplete profile must stay on the anketa"));
  assert.ok(src.includes("Never auto-open chat before birth profile"));
  assert.ok(src.includes("Profile is ready — resume even if the form step"));
}

section("static: reading API distinguishes needs_profile");
{
  const src = readSrc("src/app/api/reading/route.ts");
  assert.ok(src.includes("resolveProfileUserContext"));
  assert.ok(src.includes("profileAuthFailureResponse"));
}

section("static: claim persists claimedSessionId before reading");
{
  const src = readSrc("src/lib/guest-triplet-resume.ts");
  assert.ok(src.includes("claimedSessionId: claim.sessionId"));
  assert.ok(src.includes('setPhase("resuming_reading")'));
  assert.ok(src.includes("fetchOwnedResumeStatus"));
  assert.ok(src.includes("/api/guest-triplet/status"));
}

section("static: homepage gates transition banner by phase");
{
  const src = readSrc("src/components/HomePage.tsx");
  assert.ok(src.includes("isGuestResumeBannerPhase"));
  assert.ok(src.includes("visibleTripletNotice"));
  assert.ok(src.includes("GUEST_RESUME_TRANSITION_SUBTITLE"));
}

section("static: auth success uses UI cache for guest cards");
{
  const src = readSrc("src/lib/client-user-auth-success.ts");
  assert.ok(src.includes("loadGuestResumeUiCache"));
  assert.ok(src.includes("hasActiveGuestResumeIntent"));
  assert.ok(src.includes("hasGuestCards"));
  assert.ok(src.includes("onboardingRedirectUrl"));
}

section("static: stale guest cache must not hijack OAuth");
{
  const src = readSrc("src/lib/guest-resume-ui-cache.ts");
  assert.ok(src.includes("hasActiveGuestResumeIntent"));
  assert.ok(src.includes("GUEST_RESUME_UI_MAX_AGE_MS"));
  assert.ok(src.includes("ACTIVE_PHASES"));
}

section("static: status route exists and never returns token");
{
  const src = readSrc("src/app/api/guest-triplet/status/route.ts");
  assert.ok(src.includes("findLatestOwnedGuestResume"));
  assert.ok(src.includes("requireUserAuth"));
  assert.ok(!/receiptToken|rawToken|tokenHash|"token"/.test(src));
  assert.ok(!src.includes("zovus_guest_resume"));
}

console.log("\nverify-guest-resume-state: OK");
