"use client";

import { trackSeoEvent } from "@/lib/seo/metrika";

export type RitualAnalyticsPhase =
  | "open"
  | "type_selected"
  | "questions_done"
  | "spread_done"
  | "pay_start"
  | "pay_ok"
  | "pay_fail"
  | "pay_insufficient"
  | "generate_ok"
  | "generate_fail"
  | "card_view"
  | "review_done"
  | "auth_required"
  | "age_required";

export function trackRitualStep(
  phase: RitualAnalyticsPhase,
  extra?: Record<string, string | number | boolean>
): void {
  const params: Record<string, string> = { phase };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      params[key] = String(value);
    }
  }
  trackSeoEvent("ritual_step", params);
}
