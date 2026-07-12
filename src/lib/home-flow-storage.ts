import type { FlowStep } from "@/components/FlowStepper";
import type { StoredProfile } from "@/types/stored-profile";

export const PROFILE_KEY = "aura_profile";
export const ACCOUNT_KEY = "aura_account_id";
export const FLOW_STEP_KEY = "aura_flow_step";
export const LAST_VISIT_KEY = "aura_last_visit";
export const LAST_MASTER_KEY = "aura_last_master";
export const PENDING_MASTER_KEY = "aura_pending_master";
export const PENDING_READING_KEY = "aura_pending_reading";
/** Set when server account exists but profile_user_id is still null. */
export const NEEDS_PROFILE_KEY = "aura_needs_profile";

export function persistStep(step: FlowStep) {
  localStorage.setItem(FLOW_STEP_KEY, step);
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
  const step: FlowStep = needsBirthProfileCompletion() ? "onboarding" : "masters";
  persistStep(step);
  return step;
}
