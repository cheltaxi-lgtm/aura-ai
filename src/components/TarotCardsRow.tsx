"use client";

import type { DeckSystem } from "@/lib/decks/types";
import { getDeckPositions } from "@/lib/decks";
import SymbolCardFace from "@/components/SymbolCardFace";

interface TarotCardsRowProps {
  cards: { id?: number; name: string; meaning?: string }[];
  system?: DeckSystem;
  masterId?: string;
  showMeaning?: boolean;
  size?: "md" | "lg";
}

export default function TarotCardsRow({
  cards,
  system,
  masterId,
  showMeaning = true,
  size = "md",
}: TarotCardsRowProps) {
  if (!cards.length) return null;

  const positions = system ? getDeckPositions(system) : ["Прошлое", "Настоящее", "Будущее"];

  return (
    <div className="grid grid-cols-3 gap-4 sm:gap-6 md:gap-8">
      {cards.map((card, i) => (
        <SymbolCardFace
          key={`${card.name}-${i}`}
          card={card}
          system={system}
          masterId={masterId}
          position={positions[i] ?? `Символ ${i + 1}`}
          showMeaning={showMeaning}
          size={size}
        />
      ))}
    </div>
  );
}
