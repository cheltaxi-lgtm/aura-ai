import { clearChatCache } from "@/lib/chat-cache";
import { clearGuestTriplet } from "@/lib/guest-triplet";
import {
  POST_AUTH_RETURN_TO_KEY,
  PENDING_INTENT_KEY,
} from "@/lib/post-auth-return";
import { RUNE_PENDING_PAYMENT_KEY } from "@/lib/rune-purchase-client";

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

/** Sign out on the server and wipe local client state. */
export async function performClientLogout(options: ClientLogoutOptions = {}): Promise<void> {
  const { redirectTo = "/", hardRedirect = true } = options;

  try {
    await fetch("/api/auth/me", { method: "DELETE" });
  } catch {
    /* network errors — still clear local state */
  }

  clearClientAuthState();
  window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));

  if (!hardRedirect) return;

  if (window.location.pathname + window.location.search === redirectTo) {
    window.location.reload();
  } else {
    window.location.assign(redirectTo);
  }
}
