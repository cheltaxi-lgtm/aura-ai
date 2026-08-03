"use client";

import { utmParamsForMetrika } from "@/lib/utm/attribution";

const YANDEX_METRIKA_ID = 110138367;

export function trackShareEvent(goal: string, params?: Record<string, string | number>): void {
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

export function trackShareOpen(kind: string): void {
  trackShareEvent("share_open", { kind });
}

export function trackShareCreateSuccess(kind: string): void {
  trackShareEvent("share_create_success", { kind });
}

export function trackShareCreateFail(kind: string): void {
  trackShareEvent("share_create_fail", { kind });
}

export function trackShareChannel(channel: string, kind: string): void {
  trackShareEvent("share_channel", { channel, kind });
}

export function trackShareCopySuccess(kind: string): void {
  trackShareEvent("share_copy_success", { kind });
}

export function trackShareCopyFail(kind: string): void {
  trackShareEvent("share_copy_fail", { kind });
}

export function trackShareLandingView(token: string, kind: string): void {
  trackShareEvent("share_landing_view", { token, kind });
}

export function trackShareLandingCopy(token: string, kind: string): void {
  trackShareEvent("share_landing_copy", { token, kind });
}

export function trackShareLandingCta(token: string, kind: string): void {
  trackShareEvent("share_landing_cta", { token, kind });
}
