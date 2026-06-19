"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { drawRandomCards, TRIPLET_POSITIONS, type TarotCard } from "@/lib/tarot";
import { useSceneImage } from "@/hooks/useSceneImage";
import SceneImage from "@/components/SceneImage";
import TarotCardFace from "@/components/TarotCardFace";

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
            <p className="lux-label mb-1">{TRIPLET_POSITIONS[i]}</p>
            <button
              type="button"
              onClick={() => handleFlip(i)}
              disabled={revealed[i]}
              className="lux-tarot-flip perspective-[900px] focus:outline-none disabled:cursor-default"
              style={{ width: 148, height: 236 }}
            >
              <motion.div
                className="relative h-full w-full"
                animate={{ rotateY: revealed[i] ? 180 : 0 }}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformStyle: "preserve-3d" }}
              >
                <div className="lux-tarot-back absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
                  <div className="lux-tarot-back__border" />
                  <span className="lux-tarot-back__ornament">✦</span>
                </div>
                <div
                  className="absolute inset-0"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <TarotCardFace card={card} showMeaning={false} size="md" className="h-full [&_.lux-tarot-card]:max-w-none [&_.lux-tarot-card]:h-full" />
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
        <p className="text-center text-sm font-light text-aura-champagne/80">
          Открыто {revealedCount} из 3
        </p>
      )}
    </div>
  );
}
