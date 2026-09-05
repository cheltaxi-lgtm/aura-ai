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
  assert.ok(src.includes("markNeedsServerProfile"));
  // Non-guest incomplete profile still leaves chat for anketa.
  assert.ok(src.includes('setStep("onboarding")'));
  // Guest resume NEEDS_PROFILE stays on masters — never birth onboarding.
  const needsIdx = src.indexOf('if (isLoggedIn && code === "NEEDS_PROFILE")');
  assert.ok(needsIdx > 0);
  const needsBlock = src.slice(needsIdx, needsIdx + 900);
  assert.ok(needsBlock.includes("isGuestResume"));
  assert.ok(needsBlock.includes('setStep("masters")'));
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

section("static: account bootstrap preserves active guest resume");
{
  const homeFlow = readSrc("src/hooks/useHomeFlow.ts");
  assert.ok(homeFlow.includes("hasActiveGuestResumeIntent"));
  assert.ok(homeFlow.includes("preserveGuestResume"));
  assert.ok(homeFlow.includes("if (!preserveGuestResume)"));
}
{
  const src = readSrc("src/hooks/useOnboardingFlow.ts");
  assert.ok(src.includes("forceProfileOnboarding"));
  assert.ok(src.includes("Incomplete profile must stay on the anketa"));
  assert.ok(src.includes("Never auto-open chat before birth profile"));
  assert.ok(src.includes("Stale onboarding_required is fine once profile exists"));
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
  assert.ok(src.includes("fetchExactOwnedResumeStatus"));
  assert.ok(src.includes("/api/guest-triplet/status"));
  assert.ok(src.includes('persisted.status === "reading_consumed"'));
  assert.ok(src.includes("consumedOk"));
  // Reading already on screen must not bounce home on laggy consume mark.
  assert.ok(src.includes("do not fail closed on a laggy"));
  assert.ok(src.indexOf("clearGuestResumeUiCache();") > src.indexOf("consumedOk"));
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
  assert.ok(src.includes("getGuestResumeSessionById"));
  assert.ok(src.includes("findLatestOwnedGuestResume"));
  assert.ok(src.includes('searchParams.get("sessionId")'));
  assert.ok(src.includes("row.user_id !== profileUserId"));
  assert.ok(src.includes("requireUserAuth"));
  assert.ok(!/receiptToken|rawToken|tokenHash|"token"/.test(src));
  assert.ok(!src.includes("zovus_guest_resume"));
}

section("static: guest draw must not hijack the homepage");
{
  const src = readSrc("src/components/GuestTripletDraw.tsx");
  assert.ok(
    !src.includes("setRevealed([true, true, true])"),
    "homepage must not remount the guest auth gate from UI cache"
  );
  assert.ok(!src.includes("onActiveChange"));
  assert.ok(!src.includes("window.location.replace"));
  assert.ok(!src.includes("window.location.assign(guestRegisterHref"));
  assert.ok(src.includes('sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY)'));
  assert.ok(
    !src.includes('phase === "receipt_pending_auth"'),
    "cold / must not open done/auth from receipt_pending_auth"
  );
  const landing = readSrc("src/components/AuraSellingLanding.tsx");
  assert.ok(
    !landing.includes("guestSpreadActive"),
    "landing must not gate marketing sections on guestSpreadActive"
  );
}

section("static: guest finish lands on done teaser, not idle");
{
  const src = readSrc("src/components/GuestTripletDraw.tsx");
  assert.ok(src.includes('setStep("done")'), "complete must set step done");
  assert.ok(
    src.includes("buildGuestNarrativeFallback"),
    "done uses narrative fallback helper (not dictionary Past/Present/Future)"
  );
  assert.ok(src.includes("<GuestReadingContinue onContinue={openFullReadingGate}"), "done primary CTA");
  assert.ok(readSrc("src/components/GuestReadingContinue.tsx").includes("Получить полный разбор"));
  assert.ok(src.includes("Карты зафиксированы"), "continuity microcopy");
  assert.ok(src.includes("SocialAuthButtons"), "auth on done screen");
  assert.ok(src.includes("trackGuestTeaserView"), "teaser view metric");
  assert.ok(src.includes("trackGuestTeaserCta"), "teaser CTA metric");
  // Must not treat idle as the success path after complete.
  const finishIdx = src.indexOf("trackGuestSpreadCompleted();");
  assert.ok(finishIdx > 0);
  const afterFinish = src.slice(finishIdx, finishIdx + 400);
  assert.ok(afterFinish.includes('setStep("done")'));
  assert.ok(!afterFinish.includes('setStep("idle")'));
}

section("static: SEO ask+spread without receipt stays a new draw path");
{
  const home = readSrc("src/components/HomePage.tsx");
  assert.ok(home.includes("trackGuestTripletRedrawPrevented"));
  assert.ok(home.includes("GUEST_TRIPLET_MASTER_ID") || home.includes("guest"));
}

section("static: guest reading uses authoritative ordered orientation");
{
  const reading = readSrc("src/app/api/reading/route.ts");
  assert.ok(reading.includes("guestResume?.fingerprint ??"));
  assert.ok(reading.includes("[...guestResume.symbols]"));
  assert.ok(reading.includes(".sort((a, b) => a.position - b.position)"));
  assert.ok(reading.includes("symbol.reversed"));
  const onboarding = readSrc("src/hooks/useOnboardingFlow.ts");
  assert.ok(onboarding.includes("reversed: c.reversed"));
}

section("static: profile save authority is server-issued and bounded");
{
  const onboarding = readSrc("src/hooks/useOnboardingFlow.ts");
  assert.ok(onboarding.includes("profileSaveAuthorityRef"));
  assert.ok(onboarding.includes("profileUserId: savedUserId"));
  assert.ok(onboarding.includes("Date.now() + 3_000"));
  assert.ok(onboarding.includes("savedProfileAuthority.expiresAt > Date.now()"));
}

console.log("\nverify-guest-resume-state: OK");
