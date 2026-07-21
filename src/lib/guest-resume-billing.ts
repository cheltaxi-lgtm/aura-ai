import type { SessionRow } from "@/lib/session";
import {
  computeGuestResumeFingerprint,
  GUEST_RESUME_CARDS_KIND,
  GUEST_RESUME_SPREAD_TYPE,
  parseGuestResumeCardsPayload,
  recoverGuestResumeCardsFromNames,
  type GuestResumeSymbol,
} from "@/lib/guest-triplet-receipt";
import {
  getGuestResumeSessionById,
  profileHasUsedGuestResume,
} from "@/lib/guest-triplet-receipt-db";
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

  // Defense in depth: a new claimed receipt must not be free if the profile
  // already used another landing guest reading (logout → redraw abuse).
  if (
    resume.guest_resume_status === "claimed" &&
    (await profileHasUsedGuestResume(input.profileUserId, {
      exceptSessionId: resume.id,
    }))
  ) {
    return null;
  }

  const structured = parseGuestResumeCardsPayload(resume.cards);
  const recovered = structured
    ? null
    : recoverGuestResumeCardsFromNames(resume.cards);
  const requestSymbols: GuestResumeSymbol[] | null =
    input.tarotCards?.length === 3 &&
    input.tarotCards.every((c) => typeof c.id === "number")
      ? input.tarotCards.map((c, i) => ({
          id: c.id as number,
          name: c.name,
          position: i,
          reversed: Boolean(c.reversed),
        }))
      : null;

  // Prefer structured payload; if cards were overwritten as names[], use request
  // cards (authoritative for fingerprint) or recovered names for display-only.
  let payload = structured;
  if (!payload && requestSymbols && resume.guest_resume_fingerprint) {
    const reqFp = computeGuestResumeFingerprint({
      system: (recovered?.system || "tarot-veronika") as DeckSystem,
      masterId: resume.character_key || input.characterId || "",
      spreadId: resume.spread_id || "triplet",
      symbols: requestSymbols,
    });
    if (reqFp === resume.guest_resume_fingerprint) {
      payload = {
        kind: GUEST_RESUME_CARDS_KIND,
        question: recovered?.question ?? "",
        system: (recovered?.system || "tarot-veronika") as DeckSystem,
        symbols: requestSymbols,
      };
    }
  }
  if (!payload) payload = recovered;
  if (!payload || !resume.guest_resume_fingerprint) {
    // Already-consumed reading: still allow reopen via history id.
    if (
      resume.guest_resume_status === "reading_consumed" &&
      resume.guest_resume_reading_id &&
      requestSymbols
    ) {
      return {
        free: true,
        sessionId: resume.id,
        fingerprint: resume.guest_resume_fingerprint || "consumed",
        readingId: resume.guest_resume_reading_id,
        status: resume.guest_resume_status,
        question: "",
        system: "tarot-veronika",
        symbols: requestSymbols,
        masterId: resume.character_key || "",
        cardNames: requestSymbols.map((s) =>
          s.reversed ? `${s.name} (перевёрнутая)` : s.name
        ),
      };
    }
    return null;
  }

  const expectedFp = computeGuestResumeFingerprint({
    system: payload.system,
    masterId: resume.character_key || input.characterId || "",
    spreadId: resume.spread_id || "triplet",
    symbols: payload.symbols,
  });
  // Skip fingerprint match for recovered name-only payloads (ids are placeholders).
  if (structured && expectedFp !== resume.guest_resume_fingerprint) return null;
  if (!structured && requestSymbols) {
    const reqFp = computeGuestResumeFingerprint({
      system: payload.system,
      masterId: resume.character_key || input.characterId || "",
      spreadId: resume.spread_id || "triplet",
      symbols: requestSymbols,
    });
    if (reqFp !== resume.guest_resume_fingerprint) return null;
    payload = { ...payload, symbols: requestSymbols };
  } else if (!structured && expectedFp !== resume.guest_resume_fingerprint) {
    // Name-only recovery cannot prove fingerprint — only allow if already consumed.
    if (
      resume.guest_resume_status !== "reading_consumed" ||
      !resume.guest_resume_reading_id
    ) {
      return null;
    }
  }

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
