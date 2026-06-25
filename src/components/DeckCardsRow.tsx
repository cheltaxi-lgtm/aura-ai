"use client";

import { useMemo, useState } from "react";
import type { DeckSystem } from "@/lib/decks/types";
import { getDeckPositions } from "@/lib/decks";
import { resolveDeckCard, type DeckCardInput } from "@/lib/deck-card-utils";
import DeckCard from "@/components/DeckCard";
import CardDetailModal from "@/components/CardDetailModal";

interface DeckCardsRowProps {
  cards: DeckCardInput[];
  system?: DeckSystem;
  masterId?: string;
  showMeaning?: boolean;
  size?: "sm" | "md" | "lg";
  enableDetail?: boolean;
  /** Aligned spread layout with fixed caption baselines */
  aligned?: boolean;
  /** Override the deck's default position labels (e.g. daily forecast). */
  positions?: readonly string[];
}

export default function DeckCardsRow({
  cards,
  system,
  masterId,
  showMeaning = true,
  size = "md",
  enableDetail = true,
  aligned = false,
  positions: positionsOverride,
}: DeckCardsRowProps) {
  const [modalIndex, setModalIndex] = useState<number | null>(null);

  const positions =
    positionsOverride ??
    (system ? getDeckPositions(system) : ["Прошлое", "Настоящее", "Будущее"]);

  const resolvedSpread = useMemo(
    () => (system ? cards.map((c) => resolveDeckCard(system, c)) : []),
    [cards, system]
  );

  if (!cards.length) return null;

  if (aligned) {
    return (
      <>
        <div className="lux-spread-grid">
          {cards.map((card, i) => {
            const resolved = system ? resolveDeckCard(system, card) : null;
            const meaning = resolved?.shortMeaning ?? card.meaning ?? "";
            return (
              <div key={`${card.name}-${i}`} className="lux-spread-col">
                <p className="lux-label lux-spread-col__position">
                  {positions[i] ?? `Символ ${i + 1}`}
                </p>
                <div className="lux-spread-col__card">
                  <DeckCard
                    card={card}
                    system={system}
                    masterId={masterId}
                    imagePath={card.imagePath}
                    detectedOnly={card.placeholder}
                    originalName={card.originalName}
                    reversed={card.reversed}
                    showMeaning={false}
                    hideCaption
                    size={size}
                    onClick={
                      enableDetail && system ? () => setModalIndex(i) : undefined
                    }
                    className="mx-auto w-full max-w-[180px]"
                  />
                </div>
                <p className="lux-spread-col__title">{resolved?.name ?? card.name}</p>
                {showMeaning && (
                  <p className="lux-spread-col__meaning">{meaning}</p>
                )}
              </div>
            );
          })}
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

  return (
    <>
      <div className="grid grid-cols-3 items-start gap-3 sm:gap-6 md:gap-8">
        {cards.map((card, i) => (
          <DeckCard
            key={`${card.name}-${i}`}
            card={card}
            system={system}
            masterId={masterId}
            imagePath={card.imagePath}
            detectedOnly={card.placeholder}
            originalName={card.originalName}
            reversed={card.reversed}
            position={positions[i] ?? `Символ ${i + 1}`}
            showMeaning={showMeaning}
            size={size}
            onClick={
              enableDetail && system ? () => setModalIndex(i) : undefined
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

export { DeckCardsRow as TarotCardsRow };
