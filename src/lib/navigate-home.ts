import { FLOW_STEP_KEY, LAST_MASTER_KEY } from "@/lib/home-flow-storage";

/** Full navigation to `/` — resets in-app flow state (chat, overlays, step). */
export function navigateHomeHard(): void {
  try {
    localStorage.setItem(FLOW_STEP_KEY, "masters");
    localStorage.removeItem(LAST_MASTER_KEY);
  } catch {
    /* private mode */
  }
  window.location.href = "/";
}
