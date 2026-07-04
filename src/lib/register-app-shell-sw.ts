"use client";

import { shouldUseAppShellClient } from "@/lib/app-shell";

const SW_URL = "/sw-app-shell.js";

export async function registerAppShellServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;
  if (!shouldUseAppShellClient()) return null;
  if (!("serviceWorker" in navigator)) return null;

  try {
    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    }
    void registration.update();
    if ("caches" in window) {
      void caches.delete("zovus-shell-v1");
    }
    return registration;
  } catch (err) {
    console.warn("[app-shell] service worker registration failed", err);
    return null;
  }
}

export async function precacheDeckImages(urls: string[]): Promise<void> {
  if (!("caches" in window)) return;
  const cache = await caches.open("zovus-shell-v2");
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
