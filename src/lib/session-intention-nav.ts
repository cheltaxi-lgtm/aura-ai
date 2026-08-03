import { APP_SHELL_QUERY, APP_SHELL_VALUE } from "@/lib/app-shell";
import { PENDING_MASTER_KEY, persistStep } from "@/lib/home-flow-storage";
import type { IntentionStartMode } from "@/components/IntentionPicker";
import type { SessionIntention } from "@/lib/intention";

function appQuery(): string {
  return `${APP_SHELL_QUERY}=${APP_SHELL_VALUE}`;
}

export function navigateToSessionIntention(masterId: string): void {
  try {
    localStorage.setItem(PENDING_MASTER_KEY, masterId);
    persistStep("intention");
  } catch {
    /* private mode */
  }
  const qs = new URLSearchParams({ master: masterId, [APP_SHELL_QUERY]: APP_SHELL_VALUE });
  window.location.assign(`/session/intention?${qs.toString()}`);
}

export function navigateHomeAfterIntention(
  masterId: string,
  intention: SessionIntention | null,
  mode: IntentionStartMode
): void {
  const qs = new URLSearchParams({
    master: masterId,
    resume: "chat",
    [APP_SHELL_QUERY]: APP_SHELL_VALUE,
  });
  if (intention) {
    qs.set("intention", intention);
    qs.set("intentionMode", mode);
  } else {
    qs.set("intentionSkip", "1");
  }
  try {
    localStorage.removeItem(PENDING_MASTER_KEY);
    persistStep("chat");
  } catch {
    /* ignore */
  }
  window.location.assign(`/?${qs.toString()}`);
}
