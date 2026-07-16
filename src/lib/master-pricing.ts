import type { DeckSystem } from "@/lib/decks/types";

export type MasterBillingKind = "runes" | "tarot" | "slavic" | "astrology" | "numerology";

export function masterBillingKind(system: DeckSystem): MasterBillingKind {
  if (system === "runes") return "runes";
  if (system === "slavic") return "slavic";
  if (system === "astrology") return "astrology";
  if (system === "numerology") return "numerology";
  return "tarot";
}

export type MasterPriceKind = "reading" | "question";

/** Per-question unit label derived from the master's deck system. */
export function masterQuestionUnit(system: DeckSystem): string {
  switch (masterBillingKind(system)) {
    case "runes":
      return "за вопрос мастеру";
    case "tarot":
    case "slavic":
      return "за вопрос по картам";
    case "astrology":
      return "за вопрос по знакам";
    case "numerology":
      return "за вопрос по числам";
  }
}

/** Full spread reading label — matches hero/FAQ «расшифровка расклада». */
export function masterReadingUnit(system: DeckSystem): string {
  switch (masterBillingKind(system)) {
    case "runes":
      return "за расшифровку по рунам";
    case "tarot":
    case "slavic":
      return "за расшифровку расклада";
    case "astrology":
      return "за расшифровку по знакам";
    case "numerology":
      return "за расшифровку по числам";
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
  /** When set, overrides sessionOnly for which tariff to show on cards. */
  priceKind?: MasterPriceKind;
  formatRunes?: (n: number) => string;
}): MasterPriceDisplay {
  const { runesEnabled, readingCost, questionCost, sessionOnly, priceKind, priceFrom, formatRunes } =
    params;

  if (runesEnabled && formatRunes) {
    const kind: MasterPriceKind =
      priceKind ?? (sessionOnly && questionCost != null ? "question" : "reading");
    const runeAmount =
      kind === "question"
        ? (questionCost ?? readingCost ?? 15)
        : (readingCost ?? questionCost ?? 15);
    const unit = kind === "question" ? masterQuestionUnit(params.system) : masterReadingUnit(params.system);
    return { amount: `от ${formatRunes(runeAmount)}`, unit };
  }

  const unit = masterReadingUnit(params.system);
  // Fallback when runes shop is off — avoid "от по тарифу".
  if (/тариф|ᚢ|рун/i.test(priceFrom)) {
    return { amount: priceFrom, unit };
  }
  return { amount: `от ${priceFrom}`, unit };
}
