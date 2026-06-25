"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DeckSystem } from "@/lib/decks/types";
import type { DeckCardInput } from "@/lib/deck-card-utils";
import DeckCard from "@/components/DeckCard";

const RING_RUNES = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ"] as const;

const PHRASES = [
  "Настраиваем поле…",
  "Синхронизируем символы…",
  "Мастер считывает расклад…",
] as const;

interface SpreadRitualLoaderProps {
  active: boolean;
  cards?: DeckCardInput[];
  system?: DeckSystem;
}

export default function SpreadRitualLoader({
  active,
  cards = [],
  system = "runes",
}: SpreadRitualLoaderProps) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [litRunes, setLitRunes] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhraseIndex(0);
      setLitRunes(0);
      return;
    }

    const phraseTimer = window.setInterval(() => {
      setPhraseIndex((i) => (i + 1) % PHRASES.length);
    }, 2400);

    const runeTimer = window.setInterval(() => {
      setLitRunes((n) => (n >= RING_RUNES.length ? 0 : n + 1));
    }, 320);

    return () => {
      window.clearInterval(phraseTimer);
      window.clearInterval(runeTimer);
    };
  }, [active]);

  const displayCards =
    cards.length > 0
      ? cards.slice(0, 3)
      : [
          { name: "…", meaning: "" },
          { name: "…", meaning: "" },
          { name: "…", meaning: "" },
        ];

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          className="spread-ritual-loader"
          role="status"
          aria-live="polite"
          aria-label="Настраиваем поле расклада"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="spread-ritual-loader__veil" aria-hidden />

          <div className="spread-ritual-loader__content">
            <div className="spread-ritual-loader__circle-wrap">
              <motion.div
                className="spread-ritual-loader__ring spread-ritual-loader__ring--outer"
                animate={{ rotate: 360 }}
                transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                className="spread-ritual-loader__ring spread-ritual-loader__ring--inner"
                animate={{ rotate: -360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              />
              <div className="spread-ritual-loader__core" aria-hidden>
                <span className="spread-ritual-loader__core-glyph">᛭</span>
              </div>
              <ul className="spread-ritual-loader__runes" aria-hidden>
                {RING_RUNES.map((rune, i) => {
                  const angle = (i / RING_RUNES.length) * 360 - 90;
                  const rad = (angle * Math.PI) / 180;
                  const x = 50 + 42 * Math.cos(rad);
                  const y = 50 + 42 * Math.sin(rad);
                  const lit = i < litRunes;
                  return (
                    <li
                      key={rune}
                      className={`spread-ritual-loader__rune ${lit ? "spread-ritual-loader__rune--lit" : ""}`}
                      style={{ left: `${x}%`, top: `${y}%` }}
                    >
                      {rune}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="spread-ritual-loader__cards">
              {displayCards.map((card, i) => (
                <motion.div
                  key={`${card.name}-${i}`}
                  className="spread-ritual-loader__card-slot"
                  animate={{
                    rotateY: [0, 180, 360],
                    y: [0, -6, 0],
                  }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    delay: i * 0.35,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <DeckCard
                    card={card}
                    system={system}
                    showMeaning={false}
                    size="sm"
                    className="spread-ritual-loader__deck-card"
                  />
                </motion.div>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.p
                key={phraseIndex}
                className="spread-ritual-loader__phrase"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
              >
                {PHRASES[phraseIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
