"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { drawRandomCards, TRIPLET_POSITIONS, type TarotCard } from "@/lib/tarot";
import { useSceneImage } from "@/hooks/useSceneImage";
import SceneImage from "@/components/SceneImage";

interface TarotTripletProps {
  userName: string;
  zodiac?: string;
  /** When set, reuse persisted cards instead of drawing new ones on mount. */
  initialCards?: TarotCard[];
  onComplete: (cards: TarotCard[], teaser: string) => void;
}

export default function TarotTriplet({ userName, zodiac, initialCards, onComplete }: TarotTripletProps) {
  const [deck] = useState(() =>
    initialCards?.length === 3 ? initialCards : drawRandomCards(3)
  );
  const [revealed, setRevealed] = useState<boolean[]>(() =>
    initialCards?.length === 3 ? [true, true, true] : [false, false, false]
  );

  const revealedCount = revealed.filter(Boolean).length;
  const allRevealed = revealedCount === 3;

  const cardNames = useMemo(
    () => (allRevealed ? ([deck[0].name, deck[1].name, deck[2].name] as [string, string, string]) : undefined),
    [allRevealed, deck]
  );

  const { imageUrl: atmosphereUrl, loading: atmosphereLoading, failed: atmosphereFailed } = useSceneImage(
    allRevealed ? { scene: "tarot_atmosphere", cards: cardNames, zodiac } : null,
    allRevealed
  );

  const handleFlip = (index: number) => {
    if (revealed[index]) {
      return;
    }
    setRevealed((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  };

  const handleFinish = () => {
    const teaser = `${userName}, три карты легли на ваш астральный стол: «${deck[0].name}» в прошлом, «${deck[1].name}» в настоящем и «${deck[2].name}» в будущем. Энергия ${deck[1].name} сейчас доминирует — выберите наставника, чтобы услышать полную расшифровку.`;
    onComplete(deck, teaser);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <motion.p
        className="mb-8 text-center text-gray-400"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {userName}, коснитесь колоды три раза — карты откроют Прошлое, Настоящее и Будущее
      </motion.p>

      {allRevealed && atmosphereLoading && !atmosphereFailed && (
        <p className="mb-6 text-center text-xs text-gray-600">Рисуем энергию расклада…</p>
      )}

      {atmosphereUrl && (
        <SceneImage
          imageUrl={atmosphereUrl}
          loading={false}
          label="Энергия расклада"
          className="mb-8"
        />
      )}

      <div className="mb-8 flex flex-wrap items-end justify-center gap-6">
        {deck.map((card, i) => (
          <div key={card.id} className="flex flex-col items-center gap-3">
            <p className="text-xs uppercase tracking-widest text-aura-gold">
              {TRIPLET_POSITIONS[i]}
            </p>
            <button
              type="button"
              onClick={() => handleFlip(i)}
              disabled={revealed[i]}
              className="perspective-[800px] focus:outline-none disabled:cursor-default"
              style={{ width: 140, height: 220 }}
            >
              <motion.div
                className="relative h-full w-full"
                animate={{ rotateY: revealed[i] ? 180 : 0 }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                style={{ transformStyle: "preserve-3d" }}
              >
                <div
                  className="absolute inset-0 flex items-center justify-center rounded-xl border border-aura-purple/40 bg-gradient-to-br from-aura-purple/30 to-black shadow-neon"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <span className="font-display text-4xl text-aura-purple">✦</span>
                </div>
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-aura-gold/40 bg-gradient-to-br from-aura-gold/20 to-aura-bg p-3 shadow-neon-gold"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <span className="font-display text-center text-sm font-bold text-white">
                    {card.name}
                  </span>
                  <span className="mt-2 text-center text-[10px] text-gray-500">{card.meaning}</span>
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
            <p className="text-sm leading-relaxed text-gray-300">
              Карты выпали: <strong className="text-aura-neon">{deck.map((c) => c.name).join(" · ")}</strong>.
              Первая карта уже шепчет о вашем прошлом — полный разбор откроет наставник.
            </p>
            <button onClick={handleFinish} className="btn-neon mt-6 px-8 py-3 text-sm">
              Узнать смысл у мастера
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!allRevealed && (
        <p className="text-center text-sm text-aura-gold">
          Открыто {revealedCount} из 3
        </p>
      )}
    </div>
  );
}
