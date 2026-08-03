"use client";

import { trackSeoEvent } from "@/lib/seo/metrika";
import type { MemoryProductEvent } from "@/lib/memory/product-analytics";

export type MemoryAnalyticsPayload = {
  event: MemoryProductEvent;
  sessionId?: string;
  sourceType?: "reading" | "photo" | "ritual" | "daily" | "chat" | "cabinet";
  promptVersion?: string;
  consentVersion?: string;
  variant?: string;
  memoryEnabled?: boolean;
  autoCaptureEnabled?: boolean;
  momentsMode?: "active" | "quiet";
  factCategory?: "identity" | "relationship" | "preference" | "goal" | "event" | "wellbeing" | "other";
  factSourceType?: "manual" | "extracted" | "confirmed";
  sensitivity?: "normal" | "sensitive";
  numericValue?: number;
};

/** Sends only the fixed product dimensions declared above; never memory content. */
export function trackMemoryProductEvent(payload: MemoryAnalyticsPayload): void {
  const goal = payload.event.startsWith("memory_")
    ? payload.event
    : `memory_${payload.event}`;
  trackSeoEvent(goal, {
    ...(payload.sourceType ? { source_type: payload.sourceType } : {}),
    ...(payload.variant ? { variant: payload.variant } : {}),
  });

  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/metrics/memory", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/metrics/memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* Product analytics must never interrupt the user flow. */
  }
}
