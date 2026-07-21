import type { SessionRow } from "@/lib/session";
import {
  computeGuestResumeFingerprint,
  GUEST_RESUME_SPREAD_TYPE,
  parseGuestResumeCardsPayload,
  type GuestResumeSymbol,
} from "@/lib/guest-triplet-receipt";
import { getGuestResumeSessionById } from "@/lib/guest-triplet-receipt-db";
import type { DeckSystem } from "@/lib/decks/types";

export type GuestResumeFreeDecision = {
  free: boolean;
  sessionId: string;
  fingerprint: string;
  readingId: string | null;
  status: string;
  question: string;
  system: DeckSystem;
  symbols: GuestResumeSymbol[];
  masterId: string;
  cardNames: string[];
};

/**
 * Server-authoritative free entitlement for authenticated resumed guest reading.
 * Never trust client guestResume / billingExempt flags.
 */
export async function resolveGuestResumeFreeReading(input: {
  profileUserId: string;
  sessionId?: string | null;
  session?: SessionRow | null;
  characterId?: string | null;
  tarotCards?: { name: string; id?: number; reversed?: boolean }[];
}): Promise<GuestResumeFreeDecision | null> {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) return null;

  const resume = await getGuestResumeSessionById(sessionId);
  if (!resume) return null;

  if (resume.user_id !== input.profileUserId) return null;

  if (
    resume.guest_resume_status !== "claimed" &&
    resume.guest_resume_status !== "reading_consumed"
  ) {
    return null;
  }

  const payload = parseGuestResumeCardsPayload(resume.cards);
  if (!payload || !resume.guest_resume_fingerprint) return null;

  const expectedFp = computeGuestResumeFingerprint({
    system: payload.system,
    masterId: resume.character_key || input.characterId || "",
    spreadId: resume.spread_id || "triplet",
    symbols: payload.symbols,
  });
  if (expectedFp !== resume.guest_resume_fingerprint) return null;

  if (
    resume.character_key &&
    input.characterId &&
    resume.character_key !== input.characterId
  ) {
    return null;
  }

  if (input.tarotCards?.length === 3 && input.tarotCards.every((c) => typeof c.id === "number")) {
    const reqSymbols: GuestResumeSymbol[] = input.tarotCards.map((c, i) => ({
      id: c.id as number,
      name: c.name,
      position: i,
      reversed: Boolean(c.reversed),
    }));
    const reqFp = computeGuestResumeFingerprint({
      system: payload.system,
      masterId: resume.character_key || input.characterId || "",
      spreadId: resume.spread_id || "triplet",
      symbols: reqSymbols,
    });
    if (reqFp !== resume.guest_resume_fingerprint) return null;
  }

  const cardNames = [...payload.symbols]
    .sort((a, b) => a.position - b.position)
    .map((s) => (s.reversed ? `${s.name} (перевёрнутая)` : s.name));

  return {
    free: true,
    sessionId: resume.id,
    fingerprint: resume.guest_resume_fingerprint,
    readingId: resume.guest_resume_reading_id,
    status: resume.guest_resume_status || "claimed",
    question: payload.question,
    system: payload.system,
    symbols: payload.symbols,
    masterId: resume.character_key || "",
    cardNames,
  };
}

export function isGuestResumeSpreadType(spreadType?: string | null): boolean {
  return spreadType === GUEST_RESUME_SPREAD_TYPE;
}
