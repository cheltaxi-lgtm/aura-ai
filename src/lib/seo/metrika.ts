"use client";

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
}

export function trackGuestCardRevealed(index: number): void {
  trackLandingEvent("guest_card_revealed", { index });
}

export function trackGuestSpreadCompleted(): void {
  trackLandingEvent("guest_spread_completed");
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
}

export function trackPaymentCancelled(source: string): void {
  trackLandingEvent("payment_cancelled", { source });
}

/** Account row created (before birth-date profile). */
export function trackRegistrationAccountCreated(source: string): void {
  trackLandingEvent("registration_account_created", { source });
}

export function trackRegistrationCompleted(source: string): void {
  trackLandingEvent("registration_completed", { source });
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
}

export function trackGuestTripletResumeFailed(
  stage: "receipt" | "claim" | "session" | "reading" | "expired" | "storage" | "sync"
): void {
  trackLandingEvent("guest_triplet_resume_failed", { stage });
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
