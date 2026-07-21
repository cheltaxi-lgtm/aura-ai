/**
 * Non-authoritative UI cache for guest triplet resume.
 * Never stores receipt token or binding secrets.
 */
export const GUEST_RESUME_UI_CACHE_KEY = "zovus_guest_resume_ui_v1";
/** Guest receipt TTL — stale cache must not hijack normal OAuth/login. */
const GUEST_RESUME_UI_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type GuestResumeUiPhase =
  | "idle"
  | "receipt_pending_auth"
  | "claiming"
  | "onboarding_required"
  | "resuming_reading"
  | "reading_ready"
  | "recoverable_error"
  | "safe_recovery";

export type GuestResumeUiCache = {
  version: 1;
  origin: "guest";
  masterId: string;
  system: string;
  spreadId: string;
  question: string;
  teaser: string;
  cards: Array<{
    id: number;
    name: string;
    position: number;
    reversed: boolean;
  }>;
  completedAt: string;
  /** Set after successful claim — allows reading retry without receipt cookie. */
  claimedSessionId?: string;
  phase?: GuestResumeUiPhase;
};

const TERMINAL_PHASES: ReadonlySet<GuestResumeUiPhase> = new Set([
  "idle",
  "reading_ready",
  "safe_recovery",
]);

const ACTIVE_PHASES: ReadonlySet<GuestResumeUiPhase> = new Set([
  "receipt_pending_auth",
  "claiming",
  "onboarding_required",
  "resuming_reading",
  "recoverable_error",
]);

export function isGuestResumeUiCache(value: unknown): value is GuestResumeUiCache {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || v.origin !== "guest") return false;
  if (typeof v.masterId !== "string" || !v.masterId.trim()) return false;
  if (typeof v.system !== "string") return false;
  if (!Array.isArray(v.cards) || v.cards.length !== 3) return false;
  const positions = new Set<number>();
  for (const c of v.cards) {
    if (!c || typeof c !== "object") return false;
    const card = c as Record<string, unknown>;
    if (typeof card.id !== "number" || typeof card.name !== "string") return false;
    if (
      typeof card.position !== "number" ||
      !Number.isInteger(card.position) ||
      card.position < 0 ||
      card.position > 2 ||
      typeof card.reversed !== "boolean"
    ) {
      return false;
    }
    positions.add(card.position);
  }
  if (positions.size !== 3) return false;
  if (v.claimedSessionId != null && typeof v.claimedSessionId !== "string") return false;
  return true;
}

export function saveGuestResumeUiCache(cache: GuestResumeUiCache): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GUEST_RESUME_UI_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* private mode */
  }
}

export function patchGuestResumeUiCache(
  patch: Partial<GuestResumeUiCache>
): GuestResumeUiCache | null {
  const current = loadGuestResumeUiCache();
  if (!current) return null;
  const next = { ...current, ...patch };
  saveGuestResumeUiCache(next);
  return next;
}

export function loadGuestResumeUiCache(): GuestResumeUiCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GUEST_RESUME_UI_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isGuestResumeUiCache(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearGuestResumeUiCache(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(GUEST_RESUME_UI_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasGuestResumeUiCache(): boolean {
  return Boolean(loadGuestResumeUiCache());
}

/** Banner may show only during these active transition phases. */
export function isGuestResumeBannerPhase(phase?: GuestResumeUiPhase | null): boolean {
  return phase === "claiming" || phase === "resuming_reading";
}

/**
 * True only while a guest triplet is awaiting auth/onboarding/resume.
 * Stale or terminal cache must NOT redirect normal OAuth/login.
 */
export function hasActiveGuestResumeIntent(): boolean {
  const cache = loadGuestResumeUiCache();
  if (!cache || cache.cards.length !== 3) return false;

  const completedAt = Date.parse(cache.completedAt);
  if (!Number.isFinite(completedAt) || Date.now() - completedAt > GUEST_RESUME_UI_MAX_AGE_MS) {
    clearGuestResumeUiCache();
    return false;
  }

  const phase = cache.phase;
  if (!phase) {
    // Legacy cache without phase — treat as pending auth.
    return true;
  }
  if (TERMINAL_PHASES.has(phase)) {
    clearGuestResumeUiCache();
    return false;
  }
  return ACTIVE_PHASES.has(phase);
}
