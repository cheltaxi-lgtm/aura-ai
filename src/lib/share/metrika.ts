"use client";

const YANDEX_METRIKA_ID = 110138367;

declare global {
  interface Window {
    ym?: (id: number, method: string, goal: string, params?: Record<string, string>) => void;
  }
}

export function trackShareEvent(goal: string, params?: Record<string, string>): void {
  if (typeof window === "undefined" || !window.ym) return;
  try {
    window.ym(YANDEX_METRIKA_ID, "reachGoal", goal, params);
  } catch {
    /* analytics optional */
  }
}

export function trackShareOpen(kind: string): void {
  trackShareEvent("share_open", { kind });
}

export function trackShareChannel(channel: string, kind: string): void {
  trackShareEvent(`share_channel_${channel}`, { kind });
}

export function trackShareLandingView(token: string, kind: string): void {
  trackShareEvent("share_landing_view", { token, kind });
}
