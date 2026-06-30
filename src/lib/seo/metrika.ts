"use client";

const YANDEX_METRIKA_ID = 110138367;

declare global {
  interface Window {
    ym?: (id: number, method: string, goal: string, params?: Record<string, string>) => void;
  }
}

export function trackSeoEvent(goal: string, params?: Record<string, string>): void {
  if (typeof window === "undefined" || !window.ym) return;
  try {
    window.ym(YANDEX_METRIKA_ID, "reachGoal", goal, params);
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
