import type { DeckSystem } from "@/lib/decks/types";

export type MasterBillingKind = "runes" | "tarot" | "slavic" | "astrology";

export function masterBillingKind(system: DeckSystem): MasterBillingKind {
  if (system === "runes") return "runes";
  if (system === "slavic") return "slavic";
  if (system === "astrology") return "astrology";
  return "tarot";
}

/** Per-question unit label derived from the master's deck system. */
export function masterQuestionUnit(system: DeckSystem): string {
  switch (masterBillingKind(system)) {
    case "runes":
      return "по рунам за вопрос";
    case "tarot":
    case "slavic":
      return "по картам за вопрос";
    case "astrology":
      return "по знакам за вопрос";
  }
}

export interface MasterPriceDisplay {
  amount: string;
  unit: string;
}

export function formatMasterPriceDisplay(params: {
  system: DeckSystem;
  priceFrom: string;
  /** Rune billing active */
  runesEnabled?: boolean;
  readingCost?: number;
  questionCost?: number;
  sessionOnly?: boolean;
  formatRunes?: (n: number) => string;
}): MasterPriceDisplay {
  const unit = masterQuestionUnit(params.system);
  const { runesEnabled, readingCost, questionCost, sessionOnly, priceFrom, formatRunes } = params;

  if (runesEnabled && formatRunes) {
    const runeAmount =
      sessionOnly && questionCost != null
        ? questionCost
        : readingCost ?? questionCost ?? 15;
    return { amount: `от ${formatRunes(runeAmount)}`, unit };
  }

  return { amount: `от ${priceFrom}`, unit };
}
