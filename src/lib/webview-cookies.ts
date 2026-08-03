"use client";

import { registerPlugin } from "@capacitor/core";
import { isNativeCapacitorPlatform } from "@/lib/app-shell";

type WebViewCookiesPlugin = {
  flush: () => Promise<void>;
};

const WebViewCookies = registerPlugin<WebViewCookiesPlugin>("WebViewCookies");

/** Persist in-memory WebView cookies to disk (no-op outside native / old APKs). */
export async function flushWebViewCookies(): Promise<void> {
  if (typeof window === "undefined" || !isNativeCapacitorPlatform()) return;
  try {
    await WebViewCookies.flush();
  } catch {
    /* Plugin missing until APK rebuild — web polling still covers the gap. */
  }
}
