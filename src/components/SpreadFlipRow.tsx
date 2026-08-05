"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { DeckSystem } from "@/lib/decks/types";
import { getDeckPositionsForUi } from "@/lib/decks";
import DeckCard from "@/components/DeckCard";

export interface SpreadFlipCard {
  id?: string;
  name: string;
  meaning?: string;
}

interface SpreadFlipRowProps {
  cards: SpreadFlipCard[];
  system: DeckSystem;
  masterId?: string;
  flipped: boolean[];
  onFlip: (index: number) => void;
  /** Tighter row for narrow modals — keeps three cards on one line. */
  compact?: boolean;
  positions?: string[];
}

export default function SpreadFlipRow({
  cards,
  system,
  flipped,
  onFlip,
  compact = false,
  positions: positionsProp,
}: SpreadFlipRowProps) {
  const positions = (positionsProp ?? getDeckPositionsForUi(system)).slice(0, cards.length);
  const displayCards = cards.slice(0, positions.length || cards.length);
  const allFlipped = flipped.every(Boolean);
  const cardWidth = compact ? 104 : 120;
  const cardHeight = compact ? 166 : 192;

  return (
    <div>
      <div
        className={`mb-3 flex items-end justify-center ${compact ? "gap-3" : "flex-wrap gap-5 sm:gap-8"}`}
      >
        {displayCards.map((card, i) => (
          <div key={`${card.name}-${i}`} className="flex flex-col items-center gap-2">
            <p className="text-[10px] uppercase tracking-widest text-aura-gold/80">
              {positions[i]}
            </p>
            <button
              type="button"
              onClick={() => onFlip(i)}
              disabled={flipped[i] || (i > 0 && !flipped[i - 1])}
              className="perspective-[900px] focus:outline-none disabled:cursor-default"
              style={{ width: cardWidth, height: cardHeight }}
              aria-label={flipped[i] ? card.name : `Перевернуть ${positions[i]}`}
            >
              <motion.div
                className="relative h-full w-full"
                animate={{ rotateY: flipped[i] ? 180 : 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformStyle: "preserve-3d" }}
              >
                <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
                  <DeckCard
                    card={{ name: card.name, meaning: card.meaning ?? "" }}
                    system={system}
                    faceDown
                    showMeaning={false}
                    size="sm"
                    className="h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none"
                  />
                </div>
                <div
                  className="absolute inset-0"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <DeckCard
                    card={{ name: card.name, meaning: card.meaning ?? "" }}
                    system={system}
                    showMeaning={false}
                    hideCaption
                    size="sm"
                    className="h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none"
                  />
                </div>
              </motion.div>
            </button>
            {flipped[i] && (
              <p className="font-display text-center text-xs font-semibold text-aura-ivory">
                {card.name}
              </p>
            )}
          </div>
        ))}
      </div>
      {!allFlipped && (
        <p className="text-center text-sm text-aura-gold/90">
          {displayCards.length === 1
            ? "Переверни карту, чтобы мастер начал читать"
            : `Переверни все ${displayCards.length} карт, чтобы мастер начал читать`}
        </p>
      )}
    </div>
  );
}
