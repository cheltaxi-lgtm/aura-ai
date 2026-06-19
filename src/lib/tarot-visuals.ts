import { MAJOR_ARCANA, FULL_DECK, findTarotCardByName, type TarotCard } from "@/lib/tarot";

export function resolveTarotCard(card: {
  id?: number;
  name: string;
  meaning?: string;
}): TarotCard {
  if (typeof card.id === "number") {
    const byId = FULL_DECK.find((c) => c.id === card.id);
    if (byId) return byId;
  }

  const byName = findTarotCardByName(card.name);
  if (byName) return byName;

  const legacyMajor = MAJOR_ARCANA.find((c) => c.name === card.name);
  if (legacyMajor) return legacyMajor;

  return {
    id: -1,
    name: card.name,
    arcana: "major",
    meaning: card.meaning ?? "",
  };
}

export function tarotCardRoman(id: number): string {
  if (id < 0) return "—";
  if (id === 0) return "0";
  if (id <= 21) {
    const romans = [
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
      "XI",
      "XII",
      "XIII",
      "XIV",
      "XV",
      "XVI",
      "XVII",
      "XVIII",
      "XIX",
      "XX",
      "XXI",
    ];
    return romans[id - 1] ?? String(id);
  }
  return "—";
}

export function tarotCardCornerLabel(card: TarotCard): string {
  if (card.arcana === "major") return tarotCardRoman(card.id);
  const suitShort: Record<string, string> = {
    cups: "♢",
    wands: "♣",
    swords: "♠",
    pentacles: "♦",
  };
  return suitShort[card.suit ?? ""] ?? "—";
}
