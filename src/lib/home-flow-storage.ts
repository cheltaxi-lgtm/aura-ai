import type { FlowStep } from "@/components/FlowStepper";
import type { StoredProfile } from "@/types/stored-profile";

export const PROFILE_KEY = "aura_profile";
export const ACCOUNT_KEY = "aura_account_id";
export const FLOW_STEP_KEY = "aura_flow_step";
export const LAST_VISIT_KEY = "aura_last_visit";
export const LAST_MASTER_KEY = "aura_last_master";
export const PENDING_MASTER_KEY = "aura_pending_master";
/** Set when a guest explicitly taps a master before auth (not triplet default). */
export const GUEST_EXPLICIT_MASTER_KEY = "aura_guest_explicit_master";

export function markGuestExplicitMaster(masterId: string) {
  localStorage.setItem(PENDING_MASTER_KEY, masterId);
  localStorage.setItem(GUEST_EXPLICIT_MASTER_KEY, masterId);
}

export function clearPendingMasterResume() {
  localStorage.removeItem(PENDING_MASTER_KEY);
  localStorage.removeItem(GUEST_EXPLICIT_MASTER_KEY);
}

/** True when guest chose a master before register and PENDING still matches. */
export function hasGuestExplicitMasterResume(): boolean {
  const explicit = localStorage.getItem(GUEST_EXPLICIT_MASTER_KEY);
  const pending = localStorage.getItem(PENDING_MASTER_KEY);
  return Boolean(explicit && pending && explicit === pending);
}
export const PENDING_READING_KEY = "aura_pending_reading";
/** Set when server account exists but profile_user_id is still null. */
export const NEEDS_PROFILE_KEY = "aura_needs_profile";

export function persistStep(step: FlowStep) {
  localStorage.setItem(FLOW_STEP_KEY, step);
}

/** Remove onboarding deep-link params after profile is saved. */
export function clearOnboardingUrlParams(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("step");
  url.searchParams.delete("welcome");
  const nextSearch = url.searchParams.toString();
  window.history.replaceState(
    null,
    "",
    nextSearch ? `${url.pathname}?${nextSearch}${url.hash}` : `${url.pathname}${url.hash}`
  );
}

/** Never restore onboarding once birth date is already stored locally. */
export function resolveStoredFlowStep(
  stored: StoredProfile | null,
  preferred: FlowStep | null | undefined
): FlowStep {
  const birthComplete = Boolean(String(stored?.birthDate ?? "").trim());
  if (preferred === "onboarding" && birthComplete) {
    return (stored?.tarotCards?.length ?? 0) >= 3 ? "masters" : "triplet";
  }
  if (!preferred || preferred === "intro") {
    return birthComplete ? ((stored?.tarotCards?.length ?? 0) >= 3 ? "masters" : "triplet") : "onboarding";
  }
  return preferred;
}

export function readStoredProfile(): StoredProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredProfile;
  } catch {
    return null;
  }
}

export function persistProfileData(data: StoredProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
}

export function markNeedsServerProfile(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(NEEDS_PROFILE_KEY, "1");
}

export function clearNeedsServerProfile(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(NEEDS_PROFILE_KEY);
}

export function hasPendingServerProfile(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(NEEDS_PROFILE_KEY) === "1";
}

/** Logged-in user must finish birth-date profile on the server. */
export function needsBirthProfileCompletion(): boolean {
  if (hasPendingServerProfile()) return true;
  const profile = readStoredProfile();
  if (!profile) return false;
  return !String(profile.birthDate ?? "").trim();
}

/** Pick home flow step before navigating to `/` from cabinet or app shell. */
export function primeHomeFlowStep(): FlowStep {
  if (typeof window !== "undefined" && !localStorage.getItem(ACCOUNT_KEY)) {
    persistStep("intro");
    return "intro";
  }
  const step: FlowStep = needsBirthProfileCompletion() ? "onboarding" : "masters";
  persistStep(step);
  return step;
}
