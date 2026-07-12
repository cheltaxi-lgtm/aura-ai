import { sanitizeReturnTo } from "@/lib/safe-redirect";

export const POST_AUTH_RETURN_TO_KEY = "aura_post_auth_return_to";
export const PENDING_INTENT_KEY = "zovus_pending_intent";

export function captureReturnToFromUrl(search: string, fallback = "/"): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(search);
  const raw = params.get("returnTo") ?? params.get("next");
  if (!raw) return;
  try {
    sessionStorage.setItem(POST_AUTH_RETURN_TO_KEY, sanitizeReturnTo(raw, fallback));
  } catch {
    /* private mode */
  }
}

export function persistPostAuthReturnTo(path: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(POST_AUTH_RETURN_TO_KEY, sanitizeReturnTo(path, "/"));
  } catch {
    /* private mode */
  }
}

export function readPostAuthReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(POST_AUTH_RETURN_TO_KEY);
  } catch {
    return null;
  }
}

export function clearPostAuthReturnTo(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(POST_AUTH_RETURN_TO_KEY);
  } catch {
    /* private mode */
  }
}

export function persistPendingIntent(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_INTENT_KEY, slug.trim());
  } catch {
    /* private mode */
  }
}

export function consumePendingIntent(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const slug = sessionStorage.getItem(PENDING_INTENT_KEY);
    if (slug) sessionStorage.removeItem(PENDING_INTENT_KEY);
    return slug;
  } catch {
    return null;
  }
}

function normalizePostAuthDestination(raw: string): string {
  const safe = sanitizeReturnTo(raw, "/");
  if (safe.startsWith("/?step=onboarding") || safe === "/?step=onboarding") {
    return "/";
  }
  try {
    const url = new URL(safe, "https://zovus.ru");
    url.searchParams.delete("step");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return safe;
  }
}

/** Where to land after birth-date onboarding (or profile completion). */
export function resolvePostOnboardingDestination(): string {
  if (typeof window === "undefined") return "/";

  const intent = consumePendingIntent();
  if (intent) {
    clearPostAuthReturnTo();
    return `/?intent=${encodeURIComponent(intent)}`;
  }

  const stored = readPostAuthReturnTo();
  clearPostAuthReturnTo();
  if (stored) {
    return normalizePostAuthDestination(stored);
  }
  return "/";
}

export function postOnboardingNeedsHardNavigation(destination: string): boolean {
  if (destination !== "/") return true;
  return false;
}

export function buildAuthHref(
  path: string,
  returnTo?: string | null,
  fallback = "/"
): string {
  const safe = sanitizeReturnTo(returnTo ?? readPostAuthReturnTo(), fallback);
  if (safe === "/") return path;
  const params = new URLSearchParams({ returnTo: safe });
  return `${path}?${params.toString()}`;
}

export function onboardingRedirectUrl(): string {
  return "/?step=onboarding";
}
