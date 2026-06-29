"use client";

import { motion } from "framer-motion";
import type { DeckSystem } from "@/lib/decks/types";
import {
  getSpread,
  resolveSpreadPositions,
  type SpreadId,
} from "@/lib/spreads";
import type { SessionTopicId } from "@/lib/session-topics";
import DeckCard from "@/components/DeckCard";
import SpreadFlipRow, { type SpreadFlipCard } from "@/components/SpreadFlipRow";

interface SpreadLayoutProps {
  spreadId: SpreadId;
  cards: SpreadFlipCard[];
  system: DeckSystem;
  topic?: SessionTopicId | null;
  flipped: boolean[];
  onFlip: (index: number) => void;
  compact?: boolean;
}

function Cross5Layout({
  cards,
  system,
  positions,
  flipped,
  onFlip,
  compact,
}: {
  cards: SpreadFlipCard[];
  system: DeckSystem;
  positions: string[];
  flipped: boolean[];
  onFlip: (index: number) => void;
  compact?: boolean;
}) {
  const cardWidth = compact ? 88 : 96;
  const cardHeight = compact ? 140 : 154;
  const layout = [
    { idx: 0, className: "col-start-1 row-start-1" },
    { idx: 1, className: "col-start-2 row-start-1" },
    { idx: 2, className: "col-start-3 row-start-1" },
    { idx: 3, className: "col-start-2 row-start-2" },
    { idx: 4, className: "col-start-3 row-start-2" },
  ];

  return (
    <div className="mx-auto grid max-w-sm grid-cols-3 grid-rows-2 gap-3">
      {layout.map(({ idx, className }) => {
        const card = cards[idx];
        if (!card) return null;
        return (
          <div key={idx} className={`flex flex-col items-center gap-1 ${className}`}>
            <p className="text-[9px] uppercase tracking-widest text-aura-gold/80">
              {positions[idx]}
            </p>
            <FlipCard
              card={card}
              system={system}
              flipped={flipped[idx]}
              onFlip={() => onFlip(idx)}
              width={cardWidth}
              height={cardHeight}
              label={positions[idx]}
            />
          </div>
        );
      })}
    </div>
  );
}

function FlipCard({
  card,
  system,
  flipped,
  onFlip,
  width,
  height,
  label,
}: {
  card: SpreadFlipCard;
  system: DeckSystem;
  flipped: boolean;
  onFlip: () => void;
  width: number;
  height: number;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onFlip}
      disabled={flipped}
      className="perspective-[900px] focus:outline-none disabled:cursor-default"
      style={{ width, height }}
      aria-label={flipped ? card.name : `Перевернуть ${label}`}
    >
      <motion.div
        className="relative h-full w-full"
        animate={{ rotateY: flipped ? 180 : 0 }}
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
  );
}

function GridLayout({
  cards,
  system,
  positions,
  flipped,
  onFlip,
  compact,
  cols,
}: {
  cards: SpreadFlipCard[];
  system: DeckSystem;
  positions: string[];
  flipped: boolean[];
  onFlip: (index: number) => void;
  compact?: boolean;
  cols: number;
}) {
  const cardWidth = compact ? 80 : 96;
  const cardHeight = compact ? 128 : 152;

  return (
    <div
      className="mx-auto flex max-h-[50vh] flex-wrap justify-center gap-3 overflow-y-auto px-1 py-2"
      style={{ maxWidth: cols * (cardWidth + 16) }}
    >
      {cards.map((card, i) => (
        <div key={`${card.name}-${i}`} className="flex flex-col items-center gap-1">
          <p className="max-w-[96px] text-center text-[9px] uppercase tracking-widest text-aura-gold/80">
            {positions[i]}
          </p>
          <FlipCard
            card={card}
            system={system}
            flipped={flipped[i]}
            onFlip={() => onFlip(i)}
            width={cardWidth}
            height={cardHeight}
            label={positions[i] ?? `Позиция ${i + 1}`}
          />
        </div>
      ))}
    </div>
  );
}

export default function SpreadLayout({
  spreadId,
  cards,
  system,
  topic,
  flipped,
  onFlip,
  compact,
}: SpreadLayoutProps) {
  const spread = getSpread(spreadId);
  const positions = resolveSpreadPositions(spreadId, topic).map((p) => p.label);
  const displayCards = cards.slice(0, spread.cardCount);
  const allFlipped = flipped.slice(0, spread.cardCount).every(Boolean);

  if (spread.layout === "cross5" && spread.cardCount === 5) {
    return (
      <div>
        <Cross5Layout
          cards={displayCards}
          system={system}
          positions={positions}
          flipped={flipped}
          onFlip={onFlip}
          compact={compact}
        />
        <p className="mt-4 text-center text-sm text-white/50">
          {allFlipped
            ? "Все карты открыты"
            : `Открыто ${flipped.filter(Boolean).length} из ${spread.cardCount}`}
        </p>
      </div>
    );
  }

  if (spread.layout === "celtic10" || spread.layout === "grid7" || spread.cardCount > 3) {
    return (
      <div>
        <GridLayout
          cards={displayCards}
          system={system}
          positions={positions}
          flipped={flipped}
          onFlip={onFlip}
          compact={compact}
          cols={spread.cardCount >= 10 ? 5 : 4}
        />
        <p className="mt-4 text-center text-sm text-white/50">
          {allFlipped
            ? "Все карты открыты"
            : `Открыто ${flipped.filter(Boolean).length} из ${spread.cardCount}`}
        </p>
      </div>
    );
  }

  return (
    <SpreadFlipRow
      cards={displayCards}
      system={system}
      flipped={flipped}
      onFlip={onFlip}
      compact={compact}
      positions={positions}
    />
  );
}
