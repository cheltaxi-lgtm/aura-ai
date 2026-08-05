import { getSpreadIntentBySlug } from "@/lib/spread-intents/registry";

const STORAGE_KEY = "aura_joint_token";
const ROLE_KEY = "aura_joint_role";
const INTENT_KEY = "aura_joint_intent";

export function setJointReadingToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, token.trim());
  } catch {
    /* ignore */
  }
}

export function setJointReadingRole(role: "initiator" | "partner"): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ROLE_KEY, role);
  } catch {
    /* ignore */
  }
}

export function setJointReadingIntentSlug(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(INTENT_KEY, slug.trim());
  } catch {
    /* ignore */
  }
}

export function getJointReadingIntentSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(INTENT_KEY);
  } catch {
    return null;
  }
}

export function getJointReadingRole(): "initiator" | "partner" | null {
  if (typeof window === "undefined") return null;
  try {
    const role = sessionStorage.getItem(ROLE_KEY);
    return role === "initiator" || role === "partner" ? role : null;
  } catch {
    return null;
  }
}

/** URL query `joint=` takes precedence; persists to sessionStorage for the spread flow. */
export function resolveJointReadingToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("joint")?.trim();
    if (fromUrl) {
      sessionStorage.setItem(STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getJointReadingToken(): string | null {
  return resolveJointReadingToken();
}

export function clearJointReadingToken(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    sessionStorage.removeItem(INTENT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Fields to merge into POST /api/intention-spread for an active joint invite.
 * Always includes the full token (never truncated) and a fallback custom question
 * from the invite's intent slug when the caller did not pass one.
 */
export function resolveJointIntentionSpreadFields(options?: {
  customQuestion?: string | null;
}): { jointToken?: string; customQuestion?: string } {
  const jointToken = resolveJointReadingToken() || undefined;
  if (!jointToken) return {};

  const fromCaller = options?.customQuestion?.trim();
  if (fromCaller && fromCaller.length >= 8) {
    return { jointToken, customQuestion: fromCaller };
  }

  const intentSlug = getJointReadingIntentSlug()?.trim();
  if (intentSlug) {
    const template = getSpreadIntentBySlug(intentSlug)?.questionTemplate?.trim();
    if (template && template.length >= 8) {
      return { jointToken, customQuestion: template };
    }
    return { jointToken, customQuestion: `Совместный расклад (${intentSlug})` };
  }

  // Token without stored intent still needs a ≥8-char question for intention=custom.
  return { jointToken, customQuestion: "Совместный расклад для двоих" };
}

export function readJointDeepLinkParams(): {
  token: string | null;
  role: "initiator" | "partner" | null;
  spreadId: string | null;
  partnerName: string | null;
  initiatorName: string | null;
} {
  if (typeof window === "undefined") {
    return { token: null, role: null, spreadId: null, partnerName: null, initiatorName: null };
  }
  const params = new URLSearchParams(window.location.search);
  const token = params.get("joint")?.trim() || null;
  const roleRaw = params.get("jointRole")?.trim();
  const role = roleRaw === "initiator" || roleRaw === "partner" ? roleRaw : null;
  return {
    token,
    role,
    spreadId: params.get("spread")?.trim() || null,
    partnerName: params.get("jointPartnerName")?.trim() || params.get("jointInvite")?.trim() || null,
    initiatorName: params.get("jointInvite")?.trim() || null,
  };
}
