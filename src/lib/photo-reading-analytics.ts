"use client";

import { trackSeoEvent } from "@/lib/seo/metrika";

export type PhotoReadingAnalyticsPhase =
  | "open"
  | "upload"
  | "recognize_start"
  | "recognize_ok"
  | "recognize_partial"
  | "recognize_fail"
  | "confirm"
  | "manual_mark"
  | "interpret_start"
  | "interpret_stream"
  | "interpret_done"
  | "interpret_fail"
  | "continue_chat"
  | "ritual_upsell"
  | "followup_chip";

export function trackPhotoReadingPhase(
  phase: PhotoReadingAnalyticsPhase,
  extra?: Record<string, string | number | boolean>
): void {
  const params: Record<string, string> = { phase };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      params[key] = String(value);
    }
  }
  trackSeoEvent("photo_reading_step", params);
}
