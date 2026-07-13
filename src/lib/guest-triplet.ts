import type { SpreadSymbol } from "@/lib/decks/types";
import type { DeckSystem } from "@/lib/decks/types";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import { GUEST_TRIPLET_MASTER_ID } from "@/lib/landing-offer";
import { buildOnboardingPostBody } from "@/lib/onboarding-flow-helpers";
import type { StoredProfile } from "@/types/stored-profile";

export const GUEST_TRIPLET_KEY = "aura_guest_triplet";

export interface GuestTripletDraft {
  tarotCards: SpreadSymbol[];
  deckSystem?: DeckSystem;
  teaser: string;
  completedAt: string;
  question?: string;
  masterId?: string;
}

export function loadGuestTriplet(): GuestTripletDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GUEST_TRIPLET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestTripletDraft;
    if (!parsed.tarotCards?.length || parsed.tarotCards.length < 3) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGuestTriplet(draft: GuestTripletDraft): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GUEST_TRIPLET_KEY, JSON.stringify(draft));
}

export function clearGuestTriplet(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GUEST_TRIPLET_KEY);
}

/** Persist guest triplet to server after register (profile with birth date already exists). */
export async function syncGuestSpreadToServer(
  profile: StoredProfile,
  guest?: GuestTripletDraft | null
): Promise<boolean> {
  const draft = guest ?? loadGuestTriplet();
  const cards = profile.tarotCards?.length ? profile.tarotCards : draft?.tarotCards;
  if (!cards || cards.length < 3 || !profile.birthDate?.trim()) return false;

  const masterId = GUEST_TRIPLET_MASTER_ID;
  const teaser = profile.teaser ?? draft?.teaser ?? "";
  const body = buildOnboardingPostBody(
    profile,
    cards,
    teaser,
    typeof window !== "undefined" ? localStorage.getItem("aura_session_id") ?? undefined : undefined,
    profile.deckSystem ?? draft?.deckSystem,
    masterId
  );

  try {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function mergeGuestTripletIntoProfile<
  T extends {
    tarotCards?: SpreadSymbol[];
    deckSystem?: DeckSystem;
    teaser?: string;
    mainQuestion?: string;
    tripletMasterId?: string;
  },
>(profile: T): T {
  const guest = loadGuestTriplet();
  if (!guest || profile.tarotCards?.length) return profile;
  return {
    ...profile,
    tarotCards: guest.tarotCards,
    deckSystem: guest.deckSystem ?? DEFAULT_DECK_SYSTEM,
    teaser: guest.teaser,
    mainQuestion: guest.question || profile.mainQuestion,
    tripletMasterId: GUEST_TRIPLET_MASTER_ID,
  };
}
