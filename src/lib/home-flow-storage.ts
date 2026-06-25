import type { FlowStep } from "@/components/FlowStepper";
import type { StoredProfile } from "@/types/stored-profile";

export const PROFILE_KEY = "aura_profile";
export const ACCOUNT_KEY = "aura_account_id";
export const FLOW_STEP_KEY = "aura_flow_step";
export const LAST_VISIT_KEY = "aura_last_visit";
export const LAST_MASTER_KEY = "aura_last_master";
export const PENDING_MASTER_KEY = "aura_pending_master";
export const PENDING_READING_KEY = "aura_pending_reading";

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
