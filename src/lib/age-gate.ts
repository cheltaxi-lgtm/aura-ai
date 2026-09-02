import type { AstroMeta } from "@/lib/astro-profile";

export const AGE_GATE_STORAGE_KEY = "aura_age_gate_v1";
export const AGE_GATE_EVENT = "aura:age-confirmed";

export function isAgeGateConfirmed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(AGE_GATE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function confirmAgeGate(): void {
  try {
    localStorage.setItem(AGE_GATE_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearAgeGate(): void {
  try {
    localStorage.removeItem(AGE_GATE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Sync localStorage consent to httpOnly cookie (guest APIs). */
export async function confirmAgeGateOnServer(): Promise<boolean> {
  try {
    const res = await fetch("/api/age-gate/confirm", { method: "POST" });
    if (!res.ok) return false;
    confirmAgeGate();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AGE_GATE_EVENT));
    }
    return true;
  } catch {
    return false;
  }
}

/** Server HttpOnly age-gate cookie — legal source of truth for skipping a second 18+ step. */
export async function fetchServerAgeGateConfirmed(): Promise<boolean> {
  try {
    const res = await fetch("/api/age-gate/confirm", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return isAgeGateConfirmed();
    const data = (await res.json()) as { confirmed?: boolean };
    if (data.confirmed === true) {
      confirmAgeGate();
      return true;
    }
    // Cookie is the legal source of truth — drop stale localStorage so UI cannot skip.
    clearAgeGate();
    return false;
  } catch {
    return isAgeGateConfirmed();
  }
}

const ADULT_AGE_YEARS = 18;

function isBirthDateAdult(birthDate: string): boolean {
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= ADULT_AGE_YEARS;
}

type AgeMeta = Record<string, unknown> | AstroMeta | null | undefined;

/** Server-side: user eligible for 18+ content (explicit consent or birth date). */
export function isUserAgeEligible(user: {
  birth_date: string | null;
  astro_meta: AgeMeta;
}): boolean {
  const meta = user.astro_meta as { ageConfirmed?: boolean } | null | undefined;
  if (meta?.ageConfirmed === true) return true;
  if (!user.birth_date) return false;
  return isBirthDateAdult(user.birth_date);
}

export const AGE_REQUIRED_ERROR = {
  error: "Доступ только для пользователей 18+",
  code: "age_required" as const,
};
