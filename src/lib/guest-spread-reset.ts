import { clearGuestTriplet } from "@/lib/guest-triplet";
import { ACCOUNT_KEY, persistStep } from "@/lib/home-flow-storage";
import {
  clearPendingGuestSpreadStart,
  GUEST_SPREAD_DRAFT_KEY,
  GUEST_SPREAD_RESET_EVENT,
  LANDING_QUESTION_KEY,
} from "@/lib/landing-offer";

export { GUEST_SPREAD_DRAFT_KEY, GUEST_SPREAD_RESET_EVENT };

export type ResetGuestSpreadOptions = {
  /** Keep completed 3-card draft in localStorage (user may still register). */
  keepCompletedTriplet?: boolean;
  /** Keep typed landing question in sessionStorage. */
  keepLandingQuestion?: boolean;
};

/** Drop in-progress guest spread UI state and return home flow to intro. */
export function resetGuestSpreadFlow(options: ResetGuestSpreadOptions = {}): void {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY);
    clearPendingGuestSpreadStart();
    if (!options.keepLandingQuestion) {
      sessionStorage.removeItem(LANDING_QUESTION_KEY);
    }
  } catch {
    /* private mode */
  }

  if (!options.keepCompletedTriplet) {
    clearGuestTriplet();
  }

  if (!localStorage.getItem(ACCOUNT_KEY)) {
    persistStep("intro");
  }

  window.dispatchEvent(new CustomEvent(GUEST_SPREAD_RESET_EVENT));
}
