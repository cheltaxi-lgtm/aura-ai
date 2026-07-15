"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { DeckSystem } from "@/lib/decks/types";
import { DECK_ACCENT_CLASS, DECK_SYSTEM_LABEL } from "@/lib/deck-card-utils";
import { getDeckDefinition } from "@/lib/decks";
import DeckCard from "@/components/DeckCard";

interface TableCardFace {
  name: string;
}

interface MagicalSpreadTableProps {
  tableSize: number;
  cardCount: number;
  system: DeckSystem;
  masterId: string;
  pickedIndices: number[];
  onPick: (index: number) => void;
  disabled?: boolean;
  resolving?: boolean;
  pickHint?: string;
  error?: string | null;
  personalNote?: string;
  title?: string;
  onBack?: () => void;
  backLabel?: string;
  underSiteHeader?: boolean;
  standalone?: boolean;
  tableCards?: TableCardFace[];
}

const SYSTEM_THEME: Record<DeckSystem, string> = {
  runes: "deck-pick--runes",
  "tarot-veronika": "deck-pick--tarot-veronika",
  "tarot-marina": "deck-pick--tarot-marina",
  slavic: "deck-pick--slavic",
  astrology: "deck-pick--astrology",
  numerology: "deck-pick--numerology",
  lenormand: "deck-pick--lenormand",
};

function gridColsClass(count: number): string {
  if (count <= 9) return "deck-pick__grid--3";
  if (count <= 18) return "deck-pick__grid--4";
  if (count <= 30) return "deck-pick__grid--5";
  if (count <= 48) return "deck-pick__grid--6";
  return "deck-pick__grid--8";
}

function cardSize(count: number): "sm" | "md" {
  return count >= 24 ? "sm" : "md";
}

export default function MagicalSpreadTable({
  tableSize,
  cardCount,
  system,
  masterId,
  pickedIndices,
  onPick,
  disabled = false,
  resolving = false,
  pickHint,
  error,
  personalNote,
  title,
  onBack,
  backLabel = "← Назад",
  underSiteHeader = false,
  standalone = false,
  tableCards,
}: MagicalSpreadTableProps) {
  const faceUp = system === "numerology" && (tableCards?.length ?? 0) > 0;
  const theme = SYSTEM_THEME[system] ?? SYSTEM_THEME["tarot-veronika"];
  const accent = DECK_ACCENT_CLASS[system];
  const slotCount = faceUp ? (tableCards?.length ?? tableSize) : tableSize;
  const pickComplete = pickedIndices.length >= cardCount;
  const deckDef = getDeckDefinition(system);
  const size = cardSize(slotCount);
  const slots = useMemo(() => Array.from({ length: slotCount }, (_, i) => i), [slotCount]);
  const unitLabel = DECK_SYSTEM_LABEL[system] ?? "символов";

  const trayFace = (pickOrder: number) => {
    const idx = pickedIndices[pickOrder];
    if (idx === undefined) return { name: "?", meaning: "" };
    if (faceUp) return { name: tableCards?.[idx]?.name ?? String(idx + 1), meaning: "" };
    return { name: "?", meaning: "" };
  };

  return (
    <div
      className={`deck-pick ${theme} ${accent}${underSiteHeader ? " deck-pick--under-site-header" : ""}`}
      data-master={masterId}
    >
      <div className="deck-pick__glow" aria-hidden />

      <header className="deck-pick__header">
        {onBack ? (
          <button type="button" onClick={onBack} className="deck-pick__back">
            {backLabel}
          </button>
        ) : (
          <span className="w-16 shrink-0" />
        )}
        <div className="deck-pick__header-center">
          <p className="deck-pick__eyebrow">{personalNote ?? "Персональный расклад"}</p>
          <h2 className="deck-pick__title">{title ?? "Выберите карты"}</h2>
          <p className="deck-pick__deck-meta">
            {deckDef.symbols.length} {unitLabel} · колода мастера
          </p>
          <p className={`deck-pick__hint ${error ? "deck-pick__hint--error" : ""}`}>
            {error ??
              pickHint ??
              (faceUp
                ? `Коснитесь ${cardCount} ${cardCount === 1 ? "числа" : cardCount < 5 ? "числа" : "чисел"} — порядок задаёт позиции`
                : `Выберите ${cardCount} ${cardCount === 1 ? "карту" : cardCount < 5 ? "карты" : "карт"} из колоды`)}
          </p>
        </div>
        <div className="deck-pick__counter">
          <span className="deck-pick__counter-num">{pickedIndices.length}</span>
          <span className="deck-pick__counter-sep">/</span>
          <span>{cardCount}</span>
        </div>
      </header>

      <div className="deck-pick__body">
        <div className={`deck-pick__grid ${gridColsClass(slotCount)}`}>
          {slots.map((index) => {
            const order = pickedIndices.indexOf(index);
            const selected = order >= 0;
            const dimmed = pickComplete && !selected;
            const cardData = faceUp
              ? { name: tableCards?.[index]?.name ?? String(index + 1), meaning: "" }
              : { name: "?", meaning: "" };

            return (
              <motion.button
                key={index}
                type="button"
                disabled={disabled || resolving || pickComplete || selected}
                onClick={() => onPick(index)}
                className={`deck-pick__slot ${selected ? "deck-pick__slot--picked" : ""} ${dimmed ? "deck-pick__slot--dim" : ""}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: dimmed ? 0.28 : 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.012, 0.6), duration: 0.35 }}
                whileHover={
                  !selected && !pickComplete && !disabled
                    ? { y: -6, transition: { duration: 0.15 } }
                    : undefined
                }
                whileTap={!selected && !pickComplete && !disabled ? { scale: 0.96 } : undefined}
                aria-label={
                  selected
                    ? `Выбрано, позиция ${order + 1}`
                    : faceUp
                      ? `Число ${tableCards?.[index]?.name ?? index + 1}`
                      : `Карта ${index + 1}`
                }
              >
                <DeckCard
                  card={cardData}
                  system={system}
                  masterId={masterId}
                  size={size}
                  faceDown={!faceUp}
                  hideCaption={!faceUp}
                  interactive={false}
                  className="deck-pick__card mx-auto w-full"
                />
                <AnimatePresence>
                  {selected ? (
                    <motion.span
                      className="deck-pick__badge"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                    >
                      {order + 1}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>
      </div>

      <footer className="deck-pick__tray">
        <p className="deck-pick__tray-label">Ваш расклад</p>
        <div className="deck-pick__tray-slots">
          {Array.from({ length: cardCount }, (_, i) => {
            const filled = pickedIndices[i] !== undefined;
            return (
              <div key={i} className={`deck-pick__tray-slot ${filled ? "deck-pick__tray-slot--filled" : ""}`}>
                {filled ? (
                  <motion.div
                    initial={{ scale: 0.4, y: 12 }}
                    animate={{ scale: 1, y: 0 }}
                    className="deck-pick__tray-card"
                  >
                    <DeckCard
                      card={trayFace(i)}
                      system={system}
                      masterId={masterId}
                      size="sm"
                      faceDown={!faceUp}
                      hideCaption={!faceUp}
                      interactive={false}
                      className="h-full w-full"
                    />
                    <span className="deck-pick__tray-num">{i + 1}</span>
                  </motion.div>
                ) : (
                  <span className="deck-pick__tray-empty">{i + 1}</span>
                )}
              </div>
            );
          })}
        </div>
      </footer>

      <AnimatePresence>
        {resolving ? (
          <motion.div
            className="deck-pick__loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Loader2 className="h-10 w-10 animate-spin text-amber-300" />
            <p>{faceUp ? "Числа принимают ваш порядок…" : "Карты принимают ваш выбор…"}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
