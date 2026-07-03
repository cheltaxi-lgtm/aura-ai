"use client";

import { useEffect } from "react";
import { shouldUseAppShellClient } from "@/lib/app-shell";
import { precacheDeckImages, registerAppShellServiceWorker } from "@/lib/register-app-shell-sw";
import { readStoredProfile } from "@/lib/home-flow-storage";
import { getDeckImagePath } from "@/data/decks";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import type { DeckSystem } from "@/lib/decks/types";

/** Registers app-shell SW and warms deck image cache after first online load. */
export default function AppShellServiceWorker() {
  useEffect(() => {
    if (!shouldUseAppShellClient()) return;

    void registerAppShellServiceWorker();

    const warmDeckCache = () => {
      const profile = readStoredProfile();
      const cards = profile?.tarotCards?.slice(0, 3) ?? [];
      if (!cards.length) return;
      const system: DeckSystem = profile?.deckSystem ?? DEFAULT_DECK_SYSTEM;
      const urls = cards
        .map((card) => getDeckImagePath(system, card.name))
        .filter(Boolean);
      if (urls.length) void precacheDeckImages(urls);
    };

    if (typeof navigator !== "undefined" && navigator.onLine) {
      warmDeckCache();
    } else {
      window.addEventListener("online", warmDeckCache, { once: true });
      return () => window.removeEventListener("online", warmDeckCache);
    }
  }, []);

  return null;
}
