"use client";

import { useMemo, useState } from "react";
import type { DeckSystem } from "@/lib/decks/types";
import { getDeckPositions } from "@/lib/decks";
import { listDeckCards, resolveDeckCard } from "@/lib/deck-card-utils";
import DeckCard from "@/components/DeckCard";
import CardDetailModal from "@/components/CardDetailModal";

interface DeckCardsRowProps {
  cards: { id?: number; name: string; meaning?: string }[];
  system?: DeckSystem;
  masterId?: string;
  showMeaning?: boolean;
  size?: "sm" | "md" | "lg";
  /** Enable detail modal on card click (browse-only, no draw) */
  enableDetail?: boolean;
}

export default function DeckCardsRow({
  cards,
  system,
  masterId,
  showMeaning = true,
  size = "md",
  enableDetail = true,
}: DeckCardsRowProps) {
  const [modalIndex, setModalIndex] = useState<number | null>(null);

  const positions = system ? getDeckPositions(system) : ["Прошлое", "Настоящее", "Будущее"];

  const resolvedSpread = useMemo(
    () => (system ? cards.map((c) => resolveDeckCard(system, c)) : []),
    [cards, system]
  );

  if (!cards.length) return null;

  return (
    <>
      <div className="grid grid-cols-3 gap-3 sm:gap-6 md:gap-8">
        {cards.map((card, i) => (
          <DeckCard
            key={`${card.name}-${i}`}
            card={card}
            system={system}
            masterId={masterId}
            position={positions[i] ?? `Символ ${i + 1}`}
            showMeaning={showMeaning}
            size={size}
            onClick={
              enableDetail && system
                ? () => setModalIndex(i)
                : undefined
            }
          />
        ))}
      </div>

      {enableDetail && system && modalIndex !== null && (
        <CardDetailModal
          open
          cards={resolvedSpread}
          index={modalIndex}
          onIndexChange={setModalIndex}
          onClose={() => setModalIndex(null)}
          positionLabel={positions[modalIndex]}
        />
      )}
    </>
  );
}

/** @deprecated use DeckCardsRow */
export { DeckCardsRow as TarotCardsRow };
