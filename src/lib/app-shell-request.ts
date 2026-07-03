import type { NextRequest } from "next/server";
import { APP_SHELL_HEADER } from "@/lib/app-shell";

function parseAppShellHeader(value: string | null): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "android";
}

function looksLikeCapacitorWebView(userAgent: string): boolean {
  if (!userAgent) return false;
  if (/Capacitor/i.test(userAgent)) return true;
  // Android System WebView: "... Chrome/xxx Mobile Safari/xxx wv)"
  return /Android/i.test(userAgent) && /;\s*wv\)/i.test(userAgent);
}

/** Server-side: native Zovus app / Capacitor WebView (reCAPTCHA v3 is unreliable there). */
export function isAppShellRequest(request: NextRequest): boolean {
  if (parseAppShellHeader(request.headers.get(APP_SHELL_HEADER))) {
    return true;
  }
  return looksLikeCapacitorWebView(request.headers.get("user-agent") ?? "");
}
