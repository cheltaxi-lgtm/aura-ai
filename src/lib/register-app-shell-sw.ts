"use client";

import { isNativeCapacitorPlatform } from "@/lib/app-shell";

const SW_URL = "/sw-app-shell.js";
const LEGACY_CACHES = ["zovus-shell-v1", "zovus-shell-v2", "zovus-shell-v3"];

/** Remove SW on web — stale cached HTML was breaking the site after every deploy. */
export async function unregisterWebServiceWorkers(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (isNativeCapacitorPlatform()) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("zovus-shell")).map((key) => caches.delete(key))
      );
    }
  } catch {
    /* private mode */
  }
}

export async function registerAppShellServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;
  if (!isNativeCapacitorPlatform()) {
    await unregisterWebServiceWorkers();
    return null;
  }
  if (!("serviceWorker" in navigator)) return null;

  try {
    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    }
    void registration.update();
    if ("caches" in window) {
      for (const legacy of LEGACY_CACHES) {
        void caches.delete(legacy);
      }
    }
    return registration;
  } catch (err) {
    console.warn("[app-shell] service worker registration failed", err);
    return null;
  }
}

export async function precacheDeckImages(urls: string[]): Promise<void> {
  if (!isNativeCapacitorPlatform()) return;
  if (!("caches" in window)) return;
  const cache = await caches.open("zovus-shell-v4");
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
