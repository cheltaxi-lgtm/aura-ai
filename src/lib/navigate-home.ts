import { LAST_MASTER_KEY, primeHomeFlowStep } from "@/lib/home-flow-storage";

/** Full navigation to `/` — resets in-app flow state (chat, overlays, step). */
export function navigateHomeHard(): void {
  try {
    primeHomeFlowStep();
    localStorage.removeItem(LAST_MASTER_KEY);
  } catch {
    /* private mode */
  }
  window.location.href = "/";
}
