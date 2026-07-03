"use client";

import { shouldUseAppShellClient } from "@/lib/app-shell";

const SW_URL = "/sw-app-shell.js";
const REGISTRATION_KEY = "zovus_sw_registered_v1";

export async function registerAppShellServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;
  if (!shouldUseAppShellClient()) return null;
  if (!("serviceWorker" in navigator)) return null;

  try {
    if (sessionStorage.getItem(REGISTRATION_KEY) === "1") {
      const existing = await navigator.serviceWorker.getRegistration(SW_URL);
      return existing ?? null;
    }
  } catch {
    /* ignore */
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    try {
      sessionStorage.setItem(REGISTRATION_KEY, "1");
    } catch {
      /* ignore */
    }
    void registration.update();
    return registration;
  } catch (err) {
    console.warn("[app-shell] service worker registration failed", err);
    return null;
  }
}

export async function precacheDeckImages(urls: string[]): Promise<void> {
  if (!("caches" in window)) return;
  const cache = await caches.open("zovus-shell-v1");
  await Promise.all(
    urls.slice(0, 24).map(async (raw) => {
      try {
        const res = await fetch(raw, { credentials: "omit", cache: "reload" });
        if (res.ok) await cache.put(raw, res);
      } catch {
        /* optional warm cache */
      }
    })
  );
}
