import type { SpreadSymbol } from "@/lib/decks/types";
import type { DeckSystem } from "@/lib/decks/types";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";

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
    tripletMasterId: guest.masterId || profile.tripletMasterId,
  };
}
