import type { OnboardingData } from "@/components/OnboardingForm";
import type { DeckSystem } from "@/lib/decks/types";
import type { SpreadSymbol } from "@/lib/decks/types";

export interface StoredProfile extends OnboardingData {
  userId?: string;
  tarotCards: SpreadSymbol[];
  deckSystem?: DeckSystem;
  deckSpreads?: Partial<Record<DeckSystem, SpreadSymbol[]>>;
  teaser?: string;
  /** Client-side anchor for 24h triplet limit (survives spread deletion). */
  lastTripletDrawAt?: string;
  /** Master who owns the current daily triplet. */
  tripletMasterId?: string;
}
