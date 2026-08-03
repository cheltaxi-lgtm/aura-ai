import { FULL_DECK, TRIPLET_POSITIONS } from "./cards.js";
import type { DeckProvider, DrawnCard, TarotCardDef } from "./types.js";

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function toDrawn(card: TarotCardDef, position: number, positionLabel: string): DrawnCard {
  return {
    id: card.id,
    name: card.name,
    position,
    reversed: Math.random() < 0.45,
    meaning: card.meaning,
    slug: card.slug,
    positionLabel,
  };
}

export class LocalDeckProvider implements DeckProvider {
  drawTriplet(): DrawnCard[] {
    const picked = shuffle(FULL_DECK).slice(0, 3);
    return picked.map((card, i) => toDrawn(card, i, TRIPLET_POSITIONS[i]));
  }

  drawOne(): DrawnCard {
    const card = shuffle(FULL_DECK)[0];
    return toDrawn(card, 0, "Карта дня");
  }

  getCard(id: number): TarotCardDef | undefined {
    return FULL_DECK.find((c) => c.id === id);
  }
}

export const deckProvider: DeckProvider = new LocalDeckProvider();
