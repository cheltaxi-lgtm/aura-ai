"use client";

import { fetchAuthMeWithRetry } from "@/lib/client-auth-session";
import { clearClientAuthState } from "@/lib/client-logout";
import { clearGuestTriplet, loadGuestTriplet, syncGuestSpreadToServer } from "@/lib/guest-triplet";
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
  const guestMasterId = resolveGuestSpreadMasterId(guest?.masterId);
  const hasGuestCards = Boolean(guest?.tarotCards?.length);
  const defaultGender = opts.oauthGender ?? "female";

  if (isRegisterFlow) {
    const regSource = resolveRegistrationSource("oauth");
    trackRegistrationAccountCreated(regSource);

    if (opts.profile) {
      trackRegistrationCompleted(regSource);
      clearShareRegistrationAttribution();
      clearNeedsServerProfile();
      const mergedProfile = {
        ...opts.profile,
        tarotCards: guest?.tarotCards ?? opts.profile.tarotCards ?? [],
        deckSystem: guest?.deckSystem ?? opts.profile.deckSystem,
        teaser: guest?.teaser ?? opts.profile.teaser,
        mainQuestion: guest?.question || opts.profile.mainQuestion,
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
          tarotCards: guest?.tarotCards ?? [],
          deckSystem: guest?.deckSystem,
          teaser: guest?.teaser,
          mainQuestion: guest?.question,
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

  if (isRegisterFlow && hasGuestCards) {
    destination = resolveRegistrationReturnTo({
      guestSpread: true,
      guestMasterId,
      guestQuestion: guest?.question,
    });
    if (guest?.question?.trim()) {
      persistPendingGuestQuestion(guest.question);
    }
    if (opts.profile) {
      try {
        const raw = localStorage.getItem("aura_profile");
        const mergedProfile = raw ? JSON.parse(raw) : null;
        if (mergedProfile) {
          await syncGuestSpreadToServer(mergedProfile, guest);
        }
      } catch {
        /* reading can still load from local profile */
      }
      clearGuestTriplet();
    }
  }

  if (isRegisterFlow && opts.needsProfile) {
    persistPostAuthReturnTo(
      hasGuestCards
        ? resolveRegistrationReturnTo({
            guestSpread: true,
            guestMasterId,
            guestQuestion: guest?.question,
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
    const me = await fetchAuthMeWithRetry({ attempts: 5, delayMs: 300 });
    if (!me?.authenticated) {
      // Cookie not visible yet / login failed — don't send to onboarding.
      return destination;
    }
    const needsProfile = Boolean(me.needsProfile || !me.user?.profileUserId);
    if (needsProfile) {
      markNeedsServerProfile();
      persistPostAuthReturnTo(destination);
      localStorage.setItem(
        "aura_profile",
        JSON.stringify({
          name: me.user?.name ?? "",
          gender: defaultGender,
          birthDate: "",
          zodiac: "",
          tarotCards: [],
        })
      );
      localStorage.setItem("aura_flow_step", "onboarding");
      return onboardingRedirectUrl();
    }
    clearClientAuthState();
    clearNeedsServerProfile();
    const landing = new URL(destination, window.location.origin);
    landing.searchParams.delete("step");
    return `${landing.pathname}${landing.search}${landing.hash}`;
  }

  return destination;
}
