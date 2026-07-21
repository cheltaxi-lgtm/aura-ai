import type { DeckSystem } from "@/lib/decks/types";

export const GUEST_RESUME_TTL_MS = 24 * 60 * 60 * 1000;
export const GUEST_RESUME_TTL_SEC = 24 * 60 * 60;
export const GUEST_RESUME_SPREAD_ID = "triplet";
export const GUEST_RESUME_SPREAD_TYPE = "guest_resume";
export const GUEST_RESUME_CARDS_KIND = "guest_triplet_resume";
export const MAX_GUEST_QUESTION_LENGTH = 500;

export type GuestResumeStatus = "issued" | "claimed" | "reading_consumed" | "expired";

export type GuestResumeSymbol = {
  id: number;
  name: string;
  position: number;
  reversed: boolean;
};

export type GuestResumeCardsPayload = {
  kind: typeof GUEST_RESUME_CARDS_KIND;
  question: string;
  system: DeckSystem;
  symbols: GuestResumeSymbol[];
};

export type GuestCompleteInput = {
  masterId: string;
  system: string;
  spreadId: string;
  question?: string;
  cards: Array<{
    id?: unknown;
    name?: unknown;
    position?: unknown;
    reversed?: unknown;
  }>;
};

export function sanitizeGuestQuestion(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_GUEST_QUESTION_LENGTH);
}

export function buildGuestResumeCardsPayload(input: {
  question: string;
  system: DeckSystem;
  symbols: GuestResumeSymbol[];
}): GuestResumeCardsPayload {
  return {
    kind: GUEST_RESUME_CARDS_KIND,
    question: input.question,
    system: input.system,
    symbols: input.symbols,
  };
}

export function parseGuestResumeCardsPayload(raw: unknown): GuestResumeCardsPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== GUEST_RESUME_CARDS_KIND) return null;
  if (typeof obj.system !== "string") return null;
  if (!Array.isArray(obj.symbols) || obj.symbols.length !== 3) return null;
  const symbols: GuestResumeSymbol[] = [];
  for (const item of obj.symbols) {
    if (!item || typeof item !== "object") return null;
    const s = item as Record<string, unknown>;
    const id = typeof s.id === "number" ? s.id : Number(s.id);
    const name = typeof s.name === "string" ? s.name.trim() : "";
    const position = typeof s.position === "number" ? s.position : Number(s.position);
    if (!Number.isFinite(id) || !name || !Number.isFinite(position)) return null;
    symbols.push({
      id,
      name,
      position,
      reversed: Boolean(s.reversed),
    });
  }
  return {
    kind: GUEST_RESUME_CARDS_KIND,
    question: typeof obj.question === "string" ? obj.question : "",
    system: obj.system as DeckSystem,
    symbols,
  };
}

export function cardNamesFromGuestPayload(payload: GuestResumeCardsPayload): string[] {
  return [...payload.symbols]
    .sort((a, b) => a.position - b.position)
    .map((s) => (s.reversed ? `${s.name} (перевёрнутая)` : s.name));
}
