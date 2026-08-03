"use client";

import { readUtmAttribution } from "@/lib/utm/attribution";

/** Best-effort first-touch UTM persist after register / OAuth (server ignores if already set). */
export async function persistRegistrationAttribution(): Promise<void> {
  const attribution = readUtmAttribution();
  if (!attribution) return;
  const hasTouch = Object.keys(attribution).some(
    (k) => k.startsWith("utm_") || k.endsWith("clid")
  );
  if (!hasTouch) return;
  try {
    await fetch("/api/profile/registration-attribution", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attribution }),
    });
  } catch {
    /* optional */
  }
}
