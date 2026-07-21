"use client";

import { fetchAuthMeWithRetry } from "@/lib/client-auth-session";
import { markAuthPending, withAppShellAuthParams } from "@/lib/auth-pending";
import { clearClientAuthState } from "@/lib/client-logout";
import { flushWebViewCookies } from "@/lib/webview-cookies";
import { loadGuestTriplet } from "@/lib/guest-triplet";
import { loadGuestResumeUiCache } from "@/lib/guest-resume-ui-cache";
import {
  clearNeedsServerProfile,
  clearPendingMasterResume,
  hasGuestExplicitMasterResume,
  markNeedsServerProfile,
  clearOnboardingUrlParams,
  PENDING_MASTER_KEY,
} from "@/lib/home-flow-storage";
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

export type UserAuthSuccessOptions = {
  mode: "login" | "register";
  returnTo: string;
  isNewUser: boolean;
  needsProfile: boolean;
  userName?: string;
  profile?: Record<string, unknown> | null;
  oauthGender?: "male" | "female";
};

export async function finishUserAuthSuccess(opts: UserAuthSuccessOptions): Promise<string> {
  const returnTo = sanitizeReturnTo(opts.returnTo, "/");
  const isRegisterFlow = opts.isNewUser;
  const guest = loadGuestTriplet();
  const uiCache = loadGuestResumeUiCache();
  const guestMasterId = resolveGuestSpreadMasterId(
    guest?.masterId || uiCache?.masterId
  );
  const guestCardsFromCache = uiCache?.cards?.length === 3
    ? uiCache.cards.map((c) => ({ id: c.id, name: c.name, meaning: "" }))
    : [];
  const guestTarotCards =
    guest?.tarotCards?.length ? guest.tarotCards : guestCardsFromCache;
  const hasGuestCards = guestTarotCards.length >= 3;
  const guestQuestion =
    guest?.question?.trim() || uiCache?.question?.trim() || undefined;
  const guestTeaser = guest?.teaser || uiCache?.teaser;
  const guestDeckSystem = guest?.deckSystem || uiCache?.system;
  const defaultGender =
    opts.oauthGender ??
    inferGenderFromFirstName(opts.userName) ??
    "female";

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

  let destination = returnTo;

  if (hasGuestCards) {
    destination = resolveRegistrationReturnTo({
      guestSpread: true,
      guestMasterId,
      guestQuestion,
    });
    if (guestQuestion) {
      persistPendingGuestQuestion(guestQuestion);
    }
    // Guest resume: do not clear UI cache or sync cards here — claim coordinator owns that.
  }

  if (isRegisterFlow && opts.needsProfile) {
    persistPostAuthReturnTo(
      hasGuestCards
        ? resolveRegistrationReturnTo({
            guestSpread: true,
            guestMasterId,
            guestQuestion,
          })
        : destination
    );
    clearOnboardingUrlParams();
    return onboardingRedirectUrl();
  }

  if (isRegisterFlow && opts.profile && hasGuestCards) {
    return destination;
  }

  if (!isRegisterFlow) {
    markAuthPending();
    await flushWebViewCookies();
    const me = await fetchAuthMeWithRetry({ attempts: 5, delayMs: 300 });
    if (!me?.authenticated) {
      // Cookie not visible yet — hard-nav with pending flag; useAuth will keep polling.
      return withAppShellAuthParams(destination);
    }
    const needsProfile = Boolean(me.needsProfile || !me.user?.profileUserId);
    if (needsProfile) {
      markNeedsServerProfile();
      persistPostAuthReturnTo(
        hasGuestCards
          ? resolveRegistrationReturnTo({
              guestSpread: true,
              guestMasterId,
              guestQuestion,
            })
          : destination
      );
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
    clearClientAuthState();
    clearNeedsServerProfile();
    const landing = new URL(destination, window.location.origin);
    landing.searchParams.delete("step");
    return withAppShellAuthParams(
      `${landing.pathname}${landing.search}${landing.hash}`
    );
  }

  return destination;
}
