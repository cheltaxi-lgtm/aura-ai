"use client";

import {
  inferProductFunnelFromPath,
  trackProductFunnel,
} from "@/lib/seo/product-funnel";
import { utmParamsForMetrika } from "@/lib/utm/attribution";

const YANDEX_METRIKA_ID = 110138367;

declare global {
  interface Window {
    ym?: (id: number, method: string, ...args: unknown[]) => void;
  }
}

export function trackSeoEvent(goal: string, params?: Record<string, string | number>): void {
  if (typeof window === "undefined" || !window.ym) return;
  try {
    const withUtm = { ...utmParamsForMetrika(), ...params };
    window.ym(
      YANDEX_METRIKA_ID,
      "reachGoal",
      goal,
      Object.keys(withUtm).length ? withUtm : undefined
    );
  } catch {
    /* analytics optional */
  }
}

export function trackQuickQuestionClick(slug: string): void {
  trackSeoEvent("quick_question_click", { slug });
}

export function trackSpreadIntentView(slug: string): void {
  trackSeoEvent("spread_intent_view", { slug });
}

export function trackSpreadIntentStart(slug: string): void {
  trackSeoEvent("spread_intent_start", { slug });
}

export function trackPhotoLandingCtaClick(): void {
  trackSeoEvent("photo_landing_cta_click");
}

export function trackRitualLandingCtaClick(slug: string): void {
  trackSeoEvent("ritual_landing_cta_click", { slug });
}

export function trackRitualRecommendationView(slug: string): void {
  trackSeoEvent("ritual_recommendation_view", { slug });
}

export function trackRitualRecommendationClick(slug: string): void {
  trackSeoEvent("ritual_recommendation_click", { slug });
}

export function trackJointReadingCtaClick(): void {
  trackSeoEvent("joint_reading_cta_click");
}

export function trackNumerologyCtaClick(topic?: string): void {
  trackSeoEvent("numerology_cta_click", topic ? { topic } : undefined);
}

export function trackCardMeaningView(slug: string): void {
  trackSeoEvent("card_meaning_view", { slug });
}

export function trackCardCombinationView(slug: string): void {
  trackSeoEvent("card_combination_view", { slug });
}

/** Revenue goal — order_price/currency are recognized by Metrika for monetary reporting. */
export function trackLandingEvent(
  goal: string,
  params?: Record<string, string | number>
): void {
  trackSeoEvent(goal, params);
}

export function trackLandingView(params?: Record<string, string | number>): void {
  trackLandingEvent("landing_view", params);
  trackProductFunnel("product_view", { product: "tarot", source: "homepage" });
}

export function trackSocialProofView(): void {
  trackLandingEvent("social_proof_view");
}

export function trackHeroQuestionStarted(): void {
  trackLandingEvent("hero_question_started");
}

export function trackHeroQuestionSubmitted(entryPoint: string): void {
  trackLandingEvent("hero_question_submitted", { entry_point: entryPoint });
}

export function trackGuestSpreadStarted(): void {
  trackLandingEvent("guest_spread_started");
  trackProductFunnel("free_start", { product: "tarot", source: "guest_triplet" });
}

export function trackGuestCardRevealed(index: number): void {
  trackLandingEvent("guest_card_revealed", { index });
}

export function trackGuestSpreadCompleted(): void {
  trackLandingEvent("guest_spread_completed");
  trackProductFunnel("free_complete", { product: "tarot", source: "guest_triplet" });
}

export function trackGuestTeaserView(): void {
  trackLandingEvent("guest_teaser_view");
}

export function trackGuestTeaserCta(): void {
  trackLandingEvent("guest_teaser_cta");
  trackProductFunnel("auth_cta", { product: "tarot", source: "guest_teaser" });
}

/** Auth gate shown after teaser CTA. Not a second unified auth_cta. */
export function trackAuthGateView(source: string): void {
  trackLandingEvent("auth_gate_view", { source });
}

/** Yandex / VK click on the guest or register gate. Provider id only — never PII. */
export function trackAuthProviderClick(provider: string): void {
  const id = provider.trim().slice(0, 32);
  if (!id || /email|user|token|question|card/i.test(id)) return;
  trackLandingEvent("auth_provider_click", { provider: id });
}

/** Email register form shown (guest conversion or auth screen). */
export function trackAuthEmailView(source: string): void {
  trackLandingEvent("auth_email_view", { source });
}

/** @deprecated Use trackAuthGateView. Kept as a no-op dual-cta guard. */
export function trackGuestAuth(source: string): void {
  trackLandingEvent("guest_auth", { source });
}

/** Claim/resume of the same guest receipt after auth. */
export function trackGuestClaim(props: {
  master_id: string;
  cards_count: number;
  has_question: boolean;
}): void {
  trackLandingEvent("guest_claim", {
    master_id: props.master_id,
    cards_count: props.cards_count,
    has_question: props.has_question ? 1 : 0,
  });
  trackProductFunnel("claim_complete", {
    product: "tarot",
    source: "guest_claim",
    state: props.has_question ? "has_q" : "no_q",
  });
}

/** Full reading delivered after claim/resume. */
export function trackGuestFull(props: {
  master_id: string;
  reading_mode: string;
  has_question: boolean;
}): void {
  trackLandingEvent("guest_full", {
    master_id: props.master_id,
    reading_mode: props.reading_mode,
    has_question: props.has_question ? 1 : 0,
  });
}

export function trackGuestChatContinue(source: string): void {
  trackLandingEvent("guest_chat_continue", { source });
}

export function trackRegistrationGateView(source: string): void {
  trackLandingEvent("registration_gate_view", { source });
}

export function trackRegistrationCtaClick(source: string): void {
  trackLandingEvent("registration_cta_click", { source });
}

export function trackLandingPrimaryCtaClick(placement: string): void {
  trackLandingEvent("landing_primary_cta_click", { placement });
}

export function trackOnboardingStarted(): void {
  trackLandingEvent("onboarding_started");
}

export function trackFirstChatOpened(source: string): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem("zovus_tracked_first_chat") === "1") return;
    sessionStorage.setItem("zovus_tracked_first_chat", "1");
  } catch {
    return;
  }
  trackLandingEvent("first_chat_opened", { source });
}

export function trackRegistrationStarted(source: string): void {
  trackLandingEvent("registration_started", { source });
}

export function trackPaywallOpen(source: string): void {
  trackLandingEvent("paywall_open", { source });
  if (typeof window !== "undefined") {
    const product = inferProductFunnelFromPath(window.location.pathname);
    if (product) {
      trackProductFunnel("paid_cta", { product, source: "paywall", state: source });
    }
  }
}

export function trackPaymentCancelled(source: string): void {
  trackLandingEvent("payment_cancelled", { source });
}

/** Account row created (before birth-date profile). */
export function trackRegistrationAccountCreated(source: string): void {
  trackLandingEvent("registration_account_created", { source });
}

/** Consumer account ready for Tarot/chat (birth profile may still be missing). */
export function trackRegistrationCompleted(source: string): void {
  trackLandingEvent("registration_completed", { source });
}

export function trackProfileCompletionStarted(source: string): void {
  trackLandingEvent("profile_completion_started", { source });
}

export function trackProfileCompleted(source: string): void {
  trackLandingEvent("profile_completed", { source });
}

export function trackRegistrationError(errorType: string): void {
  trackLandingEvent("registration_error", { error_type: errorType });
}

export function trackGuestTripletResumeDetected(props: {
  has_question: boolean;
  master_id: string;
  cards_count: number;
  auth_method?: string;
}): void {
  trackLandingEvent("guest_triplet_resume_detected", {
    has_question: props.has_question ? 1 : 0,
    master_id: props.master_id,
    cards_count: props.cards_count,
    ...(props.auth_method ? { auth_method: props.auth_method } : {}),
  });
}

export function trackGuestTripletResumeStarted(props: {
  master_id: string;
  cards_count: number;
  has_question: boolean;
}): void {
  trackLandingEvent("guest_triplet_resume_started", {
    master_id: props.master_id,
    cards_count: props.cards_count,
    has_question: props.has_question ? 1 : 0,
  });
}

export function trackGuestTripletResumeCompleted(props: {
  master_id: string;
  reading_mode: string;
  has_question: boolean;
}): void {
  trackLandingEvent("guest_triplet_resume_completed", {
    master_id: props.master_id,
    reading_mode: props.reading_mode,
    has_question: props.has_question ? 1 : 0,
  });
  trackGuestFull(props);
}

export function trackGuestTripletResumeFailed(
  stage: "receipt" | "claim" | "session" | "reading" | "expired" | "storage" | "sync"
): void {
  trackLandingEvent("guest_triplet_resume_failed", { stage });
}

/** Lifetime guest intro already consumed for this account. */
export function trackGuestIntroAlreadyUsed(source: string): void {
  trackLandingEvent("guest_intro_already_used", { source });
}

/** Authenticated request tried to mint acquisition guest receipt. */
export function trackGuestIntroBlockedAuthenticated(source: string): void {
  trackLandingEvent("guest_intro_blocked_authenticated", { source });
}

export function trackGuestIntroClaimRejected(reason: string): void {
  trackLandingEvent("guest_intro_claim_rejected", { reason });
}

export function trackDailyCardsOfferView(source: string): void {
  trackLandingEvent("daily_cards_offer_view", { source });
}

export function trackDailyCardsCtaClick(source: string): void {
  trackLandingEvent("daily_cards_cta_click", { source });
}

export function trackDailyCardsStarted(source: string): void {
  trackLandingEvent("daily_cards_started", { source });
}

export function trackDailyCardsCompleted(source: string, artifactId?: string): void {
  trackLandingEvent("daily_cards_completed", {
    source,
    ...(artifactId ? { artifact_id: artifactId } : {}),
  });
}

export function trackDailyCardsReturnView(source: string): void {
  trackLandingEvent("daily_cards_return_view", { source });
}

export function trackGuestTripletRedrawPrevented(props: {
  had_ask_params: boolean;
  master_id: string;
}): void {
  trackLandingEvent("guest_triplet_redraw_prevented", {
    had_ask_params: props.had_ask_params ? 1 : 0,
    master_id: props.master_id,
  });
}

export function trackRunePurchase(amountRub: number, packageId?: string): void {
  if (typeof window === "undefined" || !window.ym || !Number.isFinite(amountRub)) return;
  try {
    window.ym(YANDEX_METRIKA_ID, "reachGoal", "rune_purchase", {
      order_price: amountRub,
      currency: "RUB",
      ...(packageId ? { packageId } : {}),
      ...utmParamsForMetrika(),
    });
  } catch {
    /* analytics optional */
  }
}
