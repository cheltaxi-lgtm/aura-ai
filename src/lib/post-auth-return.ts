import { shouldUseAppShellClient } from "@/lib/app-shell";
import { resolveMasterDeckSystem } from "@/lib/decks";
import { loadGuestTriplet } from "@/lib/guest-triplet";
import { GUEST_TRIPLET_MASTER_ID } from "@/lib/landing-offer";
import { sanitizeReturnTo } from "@/lib/safe-redirect";

export const POST_AUTH_RETURN_TO_KEY = "aura_post_auth_return_to";
export const PENDING_INTENT_KEY = "zovus_pending_intent";
export const PENDING_GUEST_QUESTION_KEY = "aura_pending_guest_question";
export const RETURN_MASTERS_HASH = "/#наставники";

export function persistPendingGuestQuestion(question: string): void {
  if (typeof window === "undefined") return;
  const q = question.trim();
  if (!q) return;
  try {
    sessionStorage.setItem(PENDING_GUEST_QUESTION_KEY, q);
  } catch {
    /* private mode */
  }
}

export function consumePendingGuestQuestion(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const q = sessionStorage.getItem(PENDING_GUEST_QUESTION_KEY);
    if (q) sessionStorage.removeItem(PENDING_GUEST_QUESTION_KEY);
    return q;
  } catch {
    return null;
  }
}

export function hasPendingGuestQuestion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(sessionStorage.getItem(PENDING_GUEST_QUESTION_KEY)?.trim());
  } catch {
    return false;
  }
}

export type RegistrationReturnContext = {
  guestSpread?: boolean;
  /** Master chosen during guest spread (falls back to saved draft or Veronika). */
  guestMasterId?: string;
  /** User question from guest spread — opens a new themed draw, not the free triplet. */
  guestQuestion?: string;
  intentSlug?: string;
  photo?: boolean;
  jointToken?: string;
  custom?: string;
};

function isGuestTripletTarotMaster(masterId: string): boolean {
  const system = resolveMasterDeckSystem(masterId);
  return system === "tarot-veronika" || system === "tarot-marina";
}

/** Guest / registration triplet is always bound to classic tarot (Veronika). */
export function resolveGuestSpreadMasterId(explicit?: string | null): string {
  const candidate = explicit?.trim();
  if (candidate && isGuestTripletTarotMaster(candidate)) {
    return GUEST_TRIPLET_MASTER_ID;
  }
  const guest = typeof window !== "undefined" ? loadGuestTriplet() : null;
  const fromGuest = guest?.masterId?.trim();
  if (fromGuest && isGuestTripletTarotMaster(fromGuest)) {
    return GUEST_TRIPLET_MASTER_ID;
  }
  return GUEST_TRIPLET_MASTER_ID;
}

export function captureReturnToFromUrl(search: string, fallback = "/"): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(search);
  const raw = params.get("returnTo") ?? params.get("next");
  if (!raw) return;
  try {
    sessionStorage.setItem(POST_AUTH_RETURN_TO_KEY, sanitizeReturnTo(raw, fallback));
  } catch {
    /* private mode */
  }
}

export function persistPostAuthReturnTo(path: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(POST_AUTH_RETURN_TO_KEY, sanitizeReturnTo(path, "/"));
  } catch {
    /* private mode */
  }
}

export function readPostAuthReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(POST_AUTH_RETURN_TO_KEY);
  } catch {
    return null;
  }
}

export function clearPostAuthReturnTo(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(POST_AUTH_RETURN_TO_KEY);
  } catch {
    /* private mode */
  }
}

export function persistPendingIntent(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_INTENT_KEY, slug.trim());
  } catch {
    /* private mode */
  }
}

export function consumePendingIntent(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const slug = sessionStorage.getItem(PENDING_INTENT_KEY);
    if (slug) sessionStorage.removeItem(PENDING_INTENT_KEY);
    return slug;
  } catch {
    return null;
  }
}

/** Append app=1 when running inside native / persisted app shell. */
export function withAppShellIfNeeded(path: string): string {
  if (typeof window === "undefined") return path;
  if (!shouldUseAppShellClient()) return path;

  try {
    const url = new URL(path, window.location.origin);
    if (url.searchParams.get("app") !== "1") {
      url.searchParams.set("app", "1");
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    if (path.includes("app=1")) return path;
    const hashIdx = path.indexOf("#");
    const hash = hashIdx >= 0 ? path.slice(hashIdx) : "";
    const base = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}app=1${hash}`;
  }
}

function normalizePostAuthDestination(raw: string): string {
  const safe = sanitizeReturnTo(raw, "/");
  if (safe.startsWith("/?step=onboarding") || safe === "/?step=onboarding") {
    return "/";
  }
  try {
    const url = new URL(safe, "https://zovus.ru");
    url.searchParams.delete("step");
    url.searchParams.delete("welcome");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return safe;
  }
}

/** Where to land after birth-date onboarding (or profile completion). */
export function resolvePostOnboardingDestination(): string {
  if (typeof window === "undefined") return "/";

  const intent = consumePendingIntent();
  if (intent) {
    clearPostAuthReturnTo();
    return withAppShellIfNeeded(`/?intent=${encodeURIComponent(intent)}`);
  }

  const stored = readPostAuthReturnTo();
  clearPostAuthReturnTo();
  if (stored) {
    return withAppShellIfNeeded(normalizePostAuthDestination(stored));
  }
  return withAppShellIfNeeded("/");
}

export function resolveRegistrationReturnTo(context: RegistrationReturnContext = {}): string {
  if (context.custom) {
    return withAppShellIfNeeded(sanitizeReturnTo(context.custom, "/"));
  }
  if (context.jointToken) {
    return withAppShellIfNeeded(`/joint-reading/${context.jointToken}`);
  }
  if (context.intentSlug) {
    return withAppShellIfNeeded(`/?intent=${encodeURIComponent(context.intentSlug)}`);
  }
  if (context.photo) {
    return withAppShellIfNeeded("/?photo=1");
  }
  if (context.guestSpread) {
    // Clean home — onboarding / claim coordinator owns next step.
    // Never emit SEO ask+spread=1 (redraw) or master-only deep links that open salon noise.
    void context.guestMasterId;
    void context.guestQuestion;
    return withAppShellIfNeeded("/");
  }
  return withAppShellIfNeeded("/");
}

export function postOnboardingNeedsHardNavigation(destination: string): boolean {
  if (destination !== "/") return true;
  return false;
}

export function buildAuthHref(
  path: string,
  returnTo?: string | null,
  fallback = "/"
): string {
  const safe = sanitizeReturnTo(returnTo ?? readPostAuthReturnTo(), fallback);
  if (safe === "/") return path;
  const params = new URLSearchParams({ returnTo: safe });
  return `${path}?${params.toString()}`;
}

export function buildRegisterHref(
  returnTo?: string | null,
  fallback = "/",
  opts?: { method?: "email" }
): string {
  const destination = returnTo ?? readPostAuthReturnTo() ?? fallback;
  const href = buildAuthHref("/auth/user/register", withAppShellIfNeeded(destination), fallback);
  if (opts?.method !== "email") return href;
  const join = href.includes("?") ? "&" : "?";
  return `${href}${join}method=email`;
}

export function buildLoginHref(returnTo?: string | null, fallback = "/"): string {
  const destination = returnTo ?? readPostAuthReturnTo() ?? fallback;
  return buildAuthHref("/auth/user/login", withAppShellIfNeeded(destination), fallback);
}

export function onboardingRedirectUrl(): string {
  return withAppShellIfNeeded("/?step=onboarding&welcome=1");
}
