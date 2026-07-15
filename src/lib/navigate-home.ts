import { LAST_MASTER_KEY, primeHomeFlowStep } from "@/lib/home-flow-storage";
import { resetGuestSpreadFlow } from "@/lib/guest-spread-reset";

/** Full navigation to `/` — resets in-app flow state (chat, overlays, step). */
export function navigateHomeHard(): void {
  try {
    primeHomeFlowStep();
    resetGuestSpreadFlow({ keepCompletedTriplet: false });
    localStorage.removeItem(LAST_MASTER_KEY);
  } catch {
    /* private mode */
  }
  window.location.href = "/";
}
