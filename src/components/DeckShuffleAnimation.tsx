"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import DeckCard from "@/components/DeckCard";
import type { DeckSystem } from "@/lib/decks/types";

const PHRASES = [
  "Делим колоду…",
  "Перемешиваем карты…",
  "Сводим стопки…",
  "Связываем с темой…",
] as const;

const RUNE_PHRASES = [
  "Трясём мешок…",
  "Руны меняют порядок…",
  "Связываем с темой…",
  "Готовим выпадение…",
] as const;

type Phase = "stack" | "split" | "riffle" | "square";

const PHASES: Phase[] = ["stack", "split", "riffle", "square"];
const CARD_COUNT = 10;

function poseForCard(
  i: number,
  phase: Phase,
  tick: number
): { x: number; y: number; rotate: number; z: number; scale: number } {
  const mid = (CARD_COUNT - 1) / 2;
  const left = i < CARD_COUNT / 2;
  const jitter = Math.sin(tick * 1.7 + i * 0.9);

  if (phase === "stack") {
    return {
      x: (i - mid) * 1.2,
      y: -i * 1.1,
      rotate: (i - mid) * 0.4,
      z: i,
      scale: 1,
    };
  }

  if (phase === "split") {
    return {
      x: left ? -52 + (i % 5) * 2 : 52 - (i % 5) * 2,
      y: -8 - (i % 5) * 1.4 + jitter * 2,
      rotate: left ? -14 - jitter * 2 : 14 + jitter * 2,
      z: i,
      scale: 0.98,
    };
  }

  if (phase === "riffle") {
    // Alternate cards drop into the center from left/right packets.
    const order = left ? i * 2 : (i - 5) * 2 + 1;
    const drop = (tick + order) % 6;
    return {
      x: left ? -28 + drop * 5 : 28 - drop * 5,
      y: -18 + drop * 4 + jitter * 3,
      rotate: left ? -8 + drop : 8 - drop,
      z: 20 + order,
      scale: 0.96 + (drop % 3) * 0.01,
    };
  }

  // square — gather into a tidy deck with a soft settle
  return {
    x: (i - mid) * 0.8 + jitter * 1.5,
    y: -i * 1.05 + Math.abs(jitter),
    rotate: (i - mid) * 0.35 + jitter * 0.8,
    z: i,
    scale: 1,
  };
}

/** Riffle-style face-down shuffle for the ritual step. */
export default function DeckShuffleAnimation({
  active,
  system = "tarot-veronika",
  topicLabel,
  /** Compact idle stack above the reshuffle button. */
  idle = false,
}: {
  active: boolean;
  system?: DeckSystem;
  topicLabel?: string | null;
  idle?: boolean;
}) {
  const isRunes = system === "runes";
  const phrases = isRunes ? RUNE_PHRASES : PHRASES;
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [tick, setTick] = useState(0);

  const phase: Phase = idle ? "stack" : PHASES[phaseIndex % PHASES.length]!;

  useEffect(() => {
    if (!active || idle) {
      setPhraseIndex(0);
      setPhaseIndex(0);
      setTick(0);
      return;
    }
    const phraseTimer = window.setInterval(() => {
      setPhraseIndex((i) => (i + 1) % phrases.length);
    }, 850);
    const phaseTimer = window.setInterval(() => {
      setPhaseIndex((i) => i + 1);
    }, 700);
    const tickTimer = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 160);
    return () => {
      window.clearInterval(phraseTimer);
      window.clearInterval(phaseTimer);
      window.clearInterval(tickTimer);
    };
  }, [active, idle, phrases.length]);

  const cards = useMemo(
    () =>
      Array.from({ length: CARD_COUNT }, (_, i) => ({
        name: `shuffle-${i}`,
        meaning: "",
      })),
    []
  );

  return (
    <div
      className={`deck-shuffle${idle ? " deck-shuffle--idle" : ""}`}
      role={idle ? undefined : "status"}
      aria-live={idle ? undefined : "polite"}
      aria-label={
        idle
          ? undefined
          : isRunes
            ? "Перемешиваем руны"
            : "Перемешиваем колоду"
      }
    >
      <div className="deck-shuffle__stage" aria-hidden>
        {cards.map((card, i) => {
          const pose = poseForCard(i, phase, tick);
          return (
            <motion.div
              key={card.name}
              className="deck-shuffle__card"
              style={{ zIndex: 10 + pose.z }}
              animate={{
                x: pose.x,
                y: pose.y,
                rotate: pose.rotate,
                scale: pose.scale,
              }}
              transition={{
                duration: idle ? 0.4 : 0.55,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <DeckCard
                card={card}
                system={system}
                faceDown
                showMeaning={false}
                hideCaption
                size="sm"
                className="deck-shuffle__deck-card"
              />
            </motion.div>
          );
        })}
      </div>

      {!idle ? (
        <>
          <AnimatePresence mode="wait">
            <motion.p
              key={`${phraseIndex}-${active}`}
              className="deck-shuffle__phrase"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.28 }}
            >
              {phrases[phraseIndex]}
            </motion.p>
          </AnimatePresence>
          {topicLabel ? (
            <p className="deck-shuffle__topic">Тема: «{topicLabel}»</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
