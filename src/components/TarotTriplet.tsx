"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DeckSystem } from "@/lib/decks/types";
import { drawSpread, getDeckPositions } from "@/lib/decks";
import type { SpreadSymbol } from "@/lib/decks/types";
import { useSceneImage } from "@/hooks/useSceneImage";
import SceneImage from "@/components/SceneImage";
import DeckCard from "@/components/DeckCard";

interface TarotTripletProps {
  userName: string;
  zodiac?: string;
  system: DeckSystem;
  initialCards?: SpreadSymbol[];
  onComplete: (cards: SpreadSymbol[], teaser: string) => void;
}

export default function TarotTriplet({
  userName,
  zodiac,
  system,
  initialCards,
  onComplete,
}: TarotTripletProps) {
  const positions = useMemo(() => getDeckPositions(system), [system]);

  const [deck] = useState(() =>
    initialCards?.length === 3 ? initialCards : drawSpread(system, 3)
  );
  const [revealed, setRevealed] = useState<boolean[]>(() =>
    initialCards?.length === 3 ? [true, true, true] : [false, false, false]
  );

  const revealedCount = revealed.filter(Boolean).length;
  const allRevealed = revealedCount === 3;

  const cardNames = useMemo(
    () =>
      allRevealed
        ? ([deck[0].name, deck[1].name, deck[2].name] as [string, string, string])
        : undefined,
    [allRevealed, deck]
  );

  const { imageUrl: atmosphereUrl, loading: atmosphereLoading, failed: atmosphereFailed } =
    useSceneImage(
      allRevealed ? { scene: "tarot_atmosphere", cards: cardNames, zodiac } : null,
      allRevealed
    );

  const handleFlip = (index: number) => {
    if (revealed[index]) return;
    setRevealed((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  };

  const handleFinish = () => {
    const teaser = `${userName}, три символа легли на ваш астральный стол: «${deck[0].name}» (${positions[0]}), «${deck[1].name}» (${positions[1]}) и «${deck[2].name}» (${positions[2]}). Энергия ${deck[1].name} сейчас доминирует — выберите наставника, чтобы услышать полную расшифровку.`;
    onComplete(deck, teaser);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <motion.p
        className="mb-8 text-center font-light text-aura-ivory/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {userName}, коснитесь колоды три раза — символы откроют {positions.join(", ")}
      </motion.p>

      {allRevealed && atmosphereLoading && !atmosphereFailed && (
        <p className="mb-6 text-center text-xs text-aura-ivory/40">Рисуем энергию расклада…</p>
      )}

      {atmosphereUrl && (
        <SceneImage
          imageUrl={atmosphereUrl}
          loading={false}
          label="Энергия расклада"
          className="mb-8"
        />
      )}

      <div className="mb-8 flex flex-wrap items-end justify-center gap-5 sm:gap-8">
        {deck.map((card, i) => (
          <div key={`${card.id}-${card.name}`} className="flex flex-col items-center gap-2">
            <p className="lux-label mb-1">{positions[i]}</p>
            <button
              type="button"
              onClick={() => handleFlip(i)}
              disabled={revealed[i]}
              className="lux-tarot-flip perspective-[900px] focus:outline-none disabled:cursor-default"
              style={{ width: 148, height: 236 }}
              aria-label={revealed[i] ? card.name : `Открыть ${positions[i]}`}
            >
              <motion.div
                className="relative h-full w-full"
                animate={{ rotateY: revealed[i] ? 180 : 0 }}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformStyle: "preserve-3d" }}
              >
                <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
                  <DeckCard card={card} system={system} faceDown showMeaning={false} size="md" className="h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none" />
                </div>
                <div
                  className="absolute inset-0"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <DeckCard card={card} system={system} showMeaning={false} size="md" className="h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none" />
                </div>
              </motion.div>
            </button>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {allRevealed && (
          <motion.div
            className="glass-panel mx-auto max-w-2xl p-6 text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="text-sm leading-relaxed text-aura-ivory/75">
              Выпало:{" "}
              <strong className="text-aura-champagne">{deck.map((c) => c.name).join(" · ")}</strong>.
              Первый символ уже шепчет о вашем прошлом — полный разбор откроет наставник.
            </p>
            <button onClick={handleFinish} className="btn-primary mt-6 px-8 py-3 text-sm">
              Узнать смысл у мастера
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!allRevealed && (
        <p className="text-center text-sm font-light text-aura-champagne/80">
          Открыто {revealedCount} из 3
        </p>
      )}
    </div>
  );
}
