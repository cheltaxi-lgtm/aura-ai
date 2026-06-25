"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const RING_RUNES = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ"] as const;

const PHRASES = [
  "Мастер готовит расшифровку…",
  "Считываю символы…",
  "Складываю послание…",
] as const;

export const SPREAD_READING_RITUAL_SEC = 20;

export function waitForSpreadReadingRitual(
  sec = SPREAD_READING_RITUAL_SEC
): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, sec * 1000);
  });
}

interface SpreadReadingRitualPanelProps {
  active: boolean;
  countdownSec?: number;
  phrases?: readonly string[];
  onComplete: () => void;
}

function formatCountdown(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SpreadReadingRitualPanel({
  active,
  countdownSec = SPREAD_READING_RITUAL_SEC,
  phrases = PHRASES,
  onComplete,
}: SpreadReadingRitualPanelProps) {
  const [secondsLeft, setSecondsLeft] = useState(countdownSec);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [litRunes, setLitRunes] = useState(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!active) {
      setSecondsLeft(countdownSec);
      setPhraseIndex(0);
      setLitRunes(0);
      completedRef.current = false;
      return;
    }

    completedRef.current = false;
    setSecondsLeft(countdownSec);

    const phraseTimer = window.setInterval(() => {
      setPhraseIndex((i) => (i + 1) % phrases.length);
    }, 2400);

    const runeTimer = window.setInterval(() => {
      setLitRunes((n) => (n >= RING_RUNES.length ? 0 : n + 1));
    }, 320);

    const countdownTimer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(countdownTimer);
          if (!completedRef.current) {
            completedRef.current = true;
            onCompleteRef.current();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(phraseTimer);
      window.clearInterval(runeTimer);
      window.clearInterval(countdownTimer);
    };
  }, [active, countdownSec, phrases.length]);

  if (!active) return null;

  return (
    <div className="spread-reading-ritual" role="status" aria-live="polite">
      <div className="spread-ritual-loader__circle-wrap spread-reading-ritual__ring">
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
          <span className="spread-ritual-loader__core-glyph spread-reading-ritual__countdown">
            {formatCountdown(secondsLeft)}
          </span>
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

      <AnimatePresence mode="wait">
        <motion.p
          key={phraseIndex}
          className="spread-reading-ritual__phrase"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.3 }}
        >
          {phrases[phraseIndex] ?? phrases[0]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
