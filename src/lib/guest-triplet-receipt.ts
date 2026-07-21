import { createHash } from "node:crypto";
import { getDeckDefinition, resolveMasterDeckSystem } from "@/lib/decks";
import type { DeckSystem } from "@/lib/decks/types";
import { GUEST_TRIPLET_MASTER_ID } from "@/lib/landing-offer";
import {
  createOAuthOpaqueCode,
  hashOAuthOpaqueCode,
  isOAuthOpaqueCode,
} from "@/lib/oauth/state-cookie";
import {
  GUEST_RESUME_SPREAD_ID,
  sanitizeGuestQuestion,
  type GuestCompleteInput,
  type GuestResumeSymbol,
} from "@/lib/guest-triplet-receipt-shared";

export * from "@/lib/guest-triplet-receipt-shared";

export function createGuestResumeToken(): string {
  return createOAuthOpaqueCode();
}

export function hashGuestResumeToken(token: string): string {
  return hashOAuthOpaqueCode(token).toString("hex");
}

export function isGuestResumeToken(value: string): boolean {
  return isOAuthOpaqueCode(value);
}

/** Server-computed fingerprint — never trust client fingerprint. */
export function computeGuestResumeFingerprint(input: {
  system: DeckSystem;
  masterId: string;
  spreadId: string;
  symbols: GuestResumeSymbol[];
}): string {
  const ordered = [...input.symbols]
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.id}:${s.position}:${s.reversed ? 1 : 0}`)
    .join("|");
  const payload = [input.system, input.masterId, input.spreadId, ordered].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export type GuestCompleteValidation =
  | {
      ok: true;
      masterId: string;
      system: DeckSystem;
      spreadId: string;
      question: string;
      symbols: GuestResumeSymbol[];
      fingerprint: string;
    }
  | { ok: false; error: string };

/** Model A: user-selected ritual — validate deck membership, not randomness. */
export function validateGuestCompleteInput(body: GuestCompleteInput): GuestCompleteValidation {
  const masterId = typeof body.masterId === "string" ? body.masterId.trim() : "";
  if (masterId !== GUEST_TRIPLET_MASTER_ID) {
    return { ok: false, error: "invalid_master" };
  }

  const system = resolveMasterDeckSystem(masterId);
  if (typeof body.system === "string" && body.system.trim() && body.system.trim() !== system) {
    return { ok: false, error: "invalid_system" };
  }

  const spreadId =
    typeof body.spreadId === "string" && body.spreadId.trim()
      ? body.spreadId.trim()
      : GUEST_RESUME_SPREAD_ID;
  if (spreadId !== GUEST_RESUME_SPREAD_ID) {
    return { ok: false, error: "invalid_spread" };
  }

  if (!Array.isArray(body.cards) || body.cards.length !== 3) {
    return { ok: false, error: "invalid_cards" };
  }

  const deck = getDeckDefinition(system);
  const byId = new Map(deck.symbols.map((s) => [s.id, s]));
  const seenIds = new Set<number>();
  const symbols: GuestResumeSymbol[] = [];

  for (let i = 0; i < body.cards.length; i++) {
    const card = body.cards[i];
    const id = typeof card.id === "number" ? card.id : Number(card.id);
    if (!Number.isFinite(id) || !byId.has(id)) {
      return { ok: false, error: "invalid_card_id" };
    }
    if (seenIds.has(id)) {
      return { ok: false, error: "duplicate_card" };
    }
    seenIds.add(id);
    const position =
      typeof card.position === "number" && Number.isFinite(card.position) ? card.position : i;
    if (!Number.isInteger(position) || position < 0 || position > 2) {
      return { ok: false, error: "invalid_position" };
    }
    const def = byId.get(id)!;
    symbols.push({
      id: def.id,
      name: def.name,
      position,
      reversed: Boolean(card.reversed),
    });
  }

  const positions = new Set(symbols.map((s) => s.position));
  if (positions.size !== 3) {
    return { ok: false, error: "invalid_position" };
  }

  const question = sanitizeGuestQuestion(body.question);
  const fingerprint = computeGuestResumeFingerprint({
    system,
    masterId,
    spreadId,
    symbols,
  });

  return {
    ok: true,
    masterId,
    system,
    spreadId,
    question,
    symbols,
    fingerprint,
  };
}
