"use client";

import { useEffect } from "react";
import { isNativeCapacitorPlatform, shouldUseAppShellClient } from "@/lib/app-shell";
import {
  precacheDeckImages,
  registerAppShellServiceWorker,
  unregisterWebServiceWorkers,
} from "@/lib/register-app-shell-sw";
import { readStoredProfile } from "@/lib/home-flow-storage";
import { getDeckImagePath } from "@/data/decks";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import type { DeckSystem } from "@/lib/decks/types";

function installChunkRecovery(): void {
  const reloadOnce = () => {
    try {
      if (sessionStorage.getItem("zovus_chunk_reload") === "1") return;
      sessionStorage.setItem("zovus_chunk_reload", "1");
    } catch {
      /* private mode */
    }
    void unregisterWebServiceWorkers().finally(() => {
      window.location.reload();
    });
  };

  window.addEventListener("error", (event) => {
    const message = String(event.message ?? "");
    if (/chunk|ChunkLoadError|Loading CSS chunk/i.test(message)) {
      reloadOnce();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = String((event.reason as Error | undefined)?.message ?? event.reason ?? "");
    if (/chunk|ChunkLoadError|Loading CSS chunk/i.test(reason)) {
      reloadOnce();
    }
  });

  try {
    sessionStorage.removeItem("zovus_chunk_reload");
  } catch {
    /* private mode */
  }
}

/** Registers app-shell SW (native only) and recovers from stale chunk caches after deploy. */
export default function AppShellServiceWorker() {
  useEffect(() => {
    installChunkRecovery();

    if (!isNativeCapacitorPlatform()) {
      void unregisterWebServiceWorkers();
      return;
    }

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
