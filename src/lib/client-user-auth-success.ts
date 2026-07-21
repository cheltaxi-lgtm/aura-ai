"use client";

import { fetchAuthMeWithRetry } from "@/lib/client-auth-session";
import { markAuthPending, withAppShellAuthParams } from "@/lib/auth-pending";
import { clearClientAuthState } from "@/lib/client-logout";
import { flushWebViewCookies } from "@/lib/webview-cookies";
import { loadGuestTriplet, saveGuestTriplet } from "@/lib/guest-triplet";
import {
  clearNeedsServerProfile,
  clearPendingMasterResume,
  hasGuestExplicitMasterResume,
  markNeedsServerProfile,
  clearOnboardingUrlParams,
  PENDING_MASTER_KEY,
} from "@/lib/home-flow-storage";
import {
  hasActiveGuestResumeIntent,
  loadGuestResumeUiCache,
  clearGuestResumeUiCache,
  saveGuestResumeUiCache,
} from "@/lib/guest-resume-ui-cache";
import {
  onboardingRedirectUrl,
  persistPendingGuestQuestion,
  persistPostAuthReturnTo,
  resolveGuestSpreadMasterId,
  resolveRegistrationReturnTo,
} from "@/lib/post-auth-return";
import { sanitizeReturnTo } from "@/lib/safe-redirect";
import {
  clearShareRegistrationAttribution,
  resolveRegistrationSource,
} from "@/lib/share/registration-attribution";
import {
  trackRegistrationAccountCreated,
  trackRegistrationCompleted,
} from "@/lib/seo/metrika";
import { persistRegistrationAttribution } from "@/lib/persist-registration-attribution";
import { inferGenderFromFirstName } from "@/lib/russian-name-gender";
import type { DeckSystem } from "@/lib/decks/types";

export type UserAuthSuccessOptions = {
  mode: "login" | "register";
  returnTo: string;
  isNewUser: boolean;
  needsProfile: boolean;
  userName?: string;
  profile?: Record<string, unknown> | null;
  oauthGender?: "male" | "female";
  /** When caller already verified /api/auth/me — skip a second poll (OAuth complete). */
  skipAuthRecheck?: boolean;
};

/**
 * Post-auth handoff for email + OAuth.
 * Guest triplet path: auth → onboarding (date/gender/city/time) → same cards → full reading.
 * Must never hijack normal provider login with a stale guest UI cache.
 */
export async function finishUserAuthSuccess(opts: UserAuthSuccessOptions): Promise<string> {
  const returnTo = sanitizeReturnTo(opts.returnTo, "/");
  const isRegisterFlow = opts.isNewUser;
  const guest = loadGuestTriplet();
  const uiCache = hasActiveGuestResumeIntent() ? loadGuestResumeUiCache() : null;

  // Stale cache left from a failed/abandoned flow — drop it so OAuth login is normal.
  if (!uiCache && loadGuestResumeUiCache()) {
    clearGuestResumeUiCache();
  }

  const guestMasterId = resolveGuestSpreadMasterId(
    guest?.masterId || uiCache?.masterId
  );
  const guestCardsFromCache =
    uiCache?.cards?.length === 3
      ? [...uiCache.cards]
          .sort((a, b) => a.position - b.position)
          .map((c) => ({
            id: c.id,
            name: c.name,
            meaning: "",
            reversed: c.reversed,
          }))
      : [];
  const guestTarotCards = guest?.tarotCards?.length
    ? guest.tarotCards
    : guestCardsFromCache;
  const hasGuestCards = Boolean(uiCache) && guestTarotCards.length >= 3;
  const guestQuestion =
    guest?.question?.trim() || uiCache?.question?.trim() || undefined;
  const guestTeaser = guest?.teaser || uiCache?.teaser;
  const guestDeckSystem = guest?.deckSystem || uiCache?.system;
  const defaultGender =
    opts.oauthGender ??
    inferGenderFromFirstName(opts.userName) ??
    "female";

  // Keep draft in sync with UI cache so HomeFlow merge still works after auth.
  if (hasGuestCards && uiCache && (guest?.tarotCards?.length ?? 0) < 3) {
    saveGuestTriplet({
      tarotCards: guestTarotCards,
      deckSystem: (guestDeckSystem as DeckSystem) || "tarot-veronika",
      teaser: guestTeaser || "",
      completedAt: uiCache.completedAt,
      question: guestQuestion,
      masterId: guestMasterId,
    });
  }

  if (isRegisterFlow) {
    const regSource = resolveRegistrationSource("oauth");
    trackRegistrationAccountCreated(regSource);
    void persistRegistrationAttribution();

    if (opts.profile) {
      trackRegistrationCompleted(regSource);
      clearShareRegistrationAttribution();
      clearNeedsServerProfile();
      const mergedProfile = {
        ...opts.profile,
        tarotCards: guestTarotCards.length
          ? guestTarotCards
          : opts.profile.tarotCards ?? [],
        deckSystem: guestDeckSystem ?? opts.profile.deckSystem,
        teaser: guestTeaser ?? opts.profile.teaser,
        mainQuestion: guestQuestion || opts.profile.mainQuestion,
        tripletMasterId: guestMasterId,
      };
      localStorage.setItem("aura_profile", JSON.stringify(mergedProfile));
      if (hasGuestCards) {
        localStorage.setItem(PENDING_MASTER_KEY, guestMasterId);
        localStorage.setItem("aura_flow_step", "masters");
      } else if (!hasGuestExplicitMasterResume()) {
        clearPendingMasterResume();
        localStorage.setItem("aura_flow_step", "triplet");
      } else {
        localStorage.setItem("aura_flow_step", "triplet");
      }
    } else {
      localStorage.setItem(
        "aura_profile",
        JSON.stringify({
          name: opts.userName?.trim() || "",
          gender: defaultGender,
          birthDate: "",
          zodiac: "",
          tarotCards: guestTarotCards,
          deckSystem: guestDeckSystem,
          teaser: guestTeaser,
          mainQuestion: guestQuestion,
          tripletMasterId: guestMasterId,
        })
      );
      if (hasGuestCards) {
        localStorage.setItem(PENDING_MASTER_KEY, guestMasterId);
      }
      localStorage.setItem("aura_flow_step", "onboarding");
      markNeedsServerProfile();
    }
  }

  // Guest resume always lands on a clean home URL — coordinator / onboarding own the next step.
  // Do NOT use /?master=… (opens salon noise) or /?ask&spread=1 (redraw).
  const guestHome = resolveRegistrationReturnTo({
    guestSpread: true,
    guestMasterId,
    guestQuestion,
  });

  if (hasGuestCards && guestQuestion) {
    persistPendingGuestQuestion(guestQuestion);
  }

  // New account without birth profile → анкета (дата, пол, город, время), then resume.
  if (isRegisterFlow && opts.needsProfile) {
    persistPostAuthReturnTo(hasGuestCards ? guestHome : returnTo);
    clearOnboardingUrlParams();
    return onboardingRedirectUrl();
  }

  if (isRegisterFlow && opts.profile && hasGuestCards) {
    return guestHome;
  }

  if (isRegisterFlow) {
    return hasGuestCards ? guestHome : returnTo;
  }

  // ——— Login (existing account, OAuth or email) ———
  markAuthPending();
  await flushWebViewCookies();

  if (opts.skipAuthRecheck) {
    if (opts.needsProfile) {
      markNeedsServerProfile();
      persistPostAuthReturnTo(hasGuestCards ? guestHome : returnTo);
      localStorage.setItem(
        "aura_profile",
        JSON.stringify({
          name: opts.userName?.trim() || "",
          gender: defaultGender,
          birthDate: "",
          zodiac: "",
          tarotCards: guestTarotCards,
          deckSystem: guestDeckSystem,
          teaser: guestTeaser,
          mainQuestion: guestQuestion,
          tripletMasterId: hasGuestCards ? guestMasterId : undefined,
        })
      );
      if (hasGuestCards) {
        localStorage.setItem(PENDING_MASTER_KEY, guestMasterId);
      }
      localStorage.setItem("aura_flow_step", "onboarding");
      return onboardingRedirectUrl();
    }
    if (hasGuestCards) {
      const resumeCache = loadGuestResumeUiCache();
      clearClientAuthState();
      if (resumeCache) {
        saveGuestResumeUiCache(resumeCache);
        saveGuestTriplet({
          tarotCards: guestTarotCards,
          deckSystem: (guestDeckSystem as DeckSystem) || "tarot-veronika",
          teaser: guestTeaser || "",
          completedAt: resumeCache.completedAt,
          question: guestQuestion,
          masterId: guestMasterId,
        });
        localStorage.setItem(PENDING_MASTER_KEY, guestMasterId);
        localStorage.setItem("aura_flow_step", "masters");
      }
      clearNeedsServerProfile();
      return guestHome;
    }
    clearClientAuthState();
    clearNeedsServerProfile();
    const landing = new URL(returnTo, window.location.origin);
    landing.searchParams.delete("step");
    return `${landing.pathname}${landing.search}${landing.hash}`;
  }

  const me = await fetchAuthMeWithRetry({ attempts: 5, delayMs: 300 });
  if (!me?.authenticated) {
    return withAppShellAuthParams(hasGuestCards ? guestHome : returnTo);
  }

  const needsProfile = Boolean(me.needsProfile || !me.user?.profileUserId);
  if (needsProfile) {
    markNeedsServerProfile();
    persistPostAuthReturnTo(hasGuestCards ? guestHome : returnTo);
    localStorage.setItem(
      "aura_profile",
      JSON.stringify({
        name: me.user?.name ?? "",
        gender: defaultGender,
        birthDate: "",
        zodiac: "",
        tarotCards: guestTarotCards,
        deckSystem: guestDeckSystem,
        teaser: guestTeaser,
        mainQuestion: guestQuestion,
        tripletMasterId: hasGuestCards ? guestMasterId : undefined,
      })
    );
    if (hasGuestCards) {
      localStorage.setItem(PENDING_MASTER_KEY, guestMasterId);
    }
    localStorage.setItem("aura_flow_step", "onboarding");
    return withAppShellAuthParams(onboardingRedirectUrl());
  }

  // Full profile: wipe generic client auth noise, but KEEP active guest resume cache.
  if (hasGuestCards) {
    const resumeCache = loadGuestResumeUiCache();
    clearClientAuthState();
    if (resumeCache) {
      saveGuestResumeUiCache(resumeCache);
      saveGuestTriplet({
        tarotCards: guestTarotCards,
        deckSystem: (guestDeckSystem as DeckSystem) || "tarot-veronika",
        teaser: guestTeaser || "",
        completedAt: resumeCache.completedAt,
        question: guestQuestion,
        masterId: guestMasterId,
      });
      localStorage.setItem(PENDING_MASTER_KEY, guestMasterId);
      localStorage.setItem("aura_flow_step", "masters");
    }
    clearNeedsServerProfile();
    return withAppShellAuthParams(guestHome);
  }

  clearClientAuthState();
  clearNeedsServerProfile();
  const landing = new URL(returnTo, window.location.origin);
  landing.searchParams.delete("step");
  return withAppShellAuthParams(
    `${landing.pathname}${landing.search}${landing.hash}`
  );
}
