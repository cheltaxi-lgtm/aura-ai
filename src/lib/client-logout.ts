import { clearChatCache } from "@/lib/chat-cache";
import { clearGuestTriplet } from "@/lib/guest-triplet";
import { clearGuestResumeUiCache } from "@/lib/guest-resume-ui-cache";
import { GUEST_SPREAD_DRAFT_KEY } from "@/lib/landing-offer";
import {
  POST_AUTH_RETURN_TO_KEY,
  PENDING_INTENT_KEY,
} from "@/lib/post-auth-return";
import { RUNE_PENDING_PAYMENT_KEY } from "@/lib/rune-purchase-client";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { waitUntilLoggedOut } from "@/lib/client-auth-session";
import { clearAuthPending } from "@/lib/auth-pending";
import { flushWebViewCookies } from "@/lib/webview-cookies";

export const AUTH_LOGOUT_EVENT = "aura:logout";

const STORAGE_KEYS = [
  "aura_session_id",
  "aura_profile",
  "aura_flow_step",
  "aura_account_id",
  "aura_last_master",
  "aura_pending_master",
  "aura_pending_reading",
  "aura_needs_profile",
  POST_AUTH_RETURN_TO_KEY,
  PENDING_INTENT_KEY,
  "aura_last_visit",
  "aura_last_triplet_at",
  "aura_runes_before_purchase",
  RUNE_PENDING_PAYMENT_KEY,
] as const;

/** Drop all client-side session/profile data for the current browser tab. */
export function clearClientAuthState(): void {
  if (typeof window === "undefined") return;
  for (const key of STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
  clearChatCache();
  clearGuestTriplet();
  clearGuestResumeUiCache();
  try {
    sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY);
  } catch {
    /* private mode */
  }
}

/** Wipe local chat/spread caches after server-side activity purge (keeps login + triplet cooldown). */
export function clearClientActivityState(): void {
  if (typeof window === "undefined") return;
  clearChatCache();
  clearGuestTriplet();
  localStorage.removeItem("aura_last_master");
  localStorage.removeItem("aura_pending_master");
  localStorage.removeItem("aura_pending_reading");
  localStorage.removeItem("aura_flow_step");
  try {
    sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY);
  } catch {
    /* private mode */
  }
  try {
    const raw = localStorage.getItem("aura_profile");
    if (!raw) return;
    const profile = JSON.parse(raw) as Record<string, unknown>;
    delete profile.tarotCards;
    delete profile.teaser;
    delete profile.deckSystem;
    delete profile.deckSpreads;
    localStorage.setItem("aura_profile", JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

export interface ClientLogoutOptions {
  /** Where to land after logout. Defaults to `/`. */
  redirectTo?: string;
  /** Hard navigation resets React state; recommended after logout. */
  hardRedirect?: boolean;
}

async function requestServerLogout(): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetchWithTimeout("/api/auth/me", {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
        timeoutMs: 10_000,
      });
      if (res.ok) {
        await flushWebViewCookies();
        return true;
      }
    } catch {
      /* retry — WebView sometimes drops the first DELETE */
    }
    await new Promise((resolve) => window.setTimeout(resolve, 200 * (attempt + 1)));
  }
  await flushWebViewCookies();
  return false;
}

/** Sign out on the server and wipe local client state. */
export async function performClientLogout(options: ClientLogoutOptions = {}): Promise<void> {
  const { redirectTo = "/", hardRedirect = true } = options;

  clearAuthPending();
  await requestServerLogout();
  // Confirm cookie is actually gone before navigating (critical on Android WebView).
  await waitUntilLoggedOut({ attempts: 5, delayMs: 200 });
  await flushWebViewCookies();

  clearClientAuthState();
  window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));

  if (!hardRedirect) return;

  let target = redirectTo;
  try {
    if (sessionStorage.getItem("zovus_app_shell") === "1") {
      const url = new URL(redirectTo, window.location.origin);
      url.searchParams.set("app", "1");
      target = `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    /* ignore */
  }

  if (window.location.pathname + window.location.search === target) {
    window.location.reload();
  } else {
    window.location.assign(target);
  }
}
