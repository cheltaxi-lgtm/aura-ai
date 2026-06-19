"use client";

import { TRIPLET_POSITIONS } from "@/lib/tarot";
import TarotCardFace from "@/components/TarotCardFace";

interface TarotCardsRowProps {
  cards: { id?: number; name: string; meaning?: string }[];
  showMeaning?: boolean;
  size?: "md" | "lg";
}

export default function TarotCardsRow({
  cards,
  showMeaning = true,
  size = "md",
}: TarotCardsRowProps) {
  if (!cards.length) return null;

  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-5">
      {cards.map((card, i) => (
        <TarotCardFace
          key={`${card.name}-${i}`}
          card={card}
          position={TRIPLET_POSITIONS[i] ?? `Карта ${i + 1}`}
          showMeaning={showMeaning}
          size={size}
        />
      ))}
    </div>
  );
}
