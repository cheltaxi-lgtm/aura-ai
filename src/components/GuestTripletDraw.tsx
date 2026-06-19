"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { drawSpread, getDeckPositions, DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import type { SpreadSymbol } from "@/lib/decks/types";
import { saveGuestTriplet } from "@/lib/guest-triplet";
import SymbolCardFace from "@/components/SymbolCardFace";

export default function GuestTripletDraw() {
  const system = DEFAULT_DECK_SYSTEM;
  const positions = getDeckPositions(system);
  const [deck] = useState(() => drawSpread(system, 3));
  const [revealed, setRevealed] = useState<boolean[]>([false, false, false]);
  const [done, setDone] = useState(false);

  const allRevealed = revealed.every(Boolean);

  const handleFlip = (index: number) => {
    if (revealed[index]) return;
    setRevealed((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  };

  const handleFinish = () => {
    const teaser = `Три карты легли на ваш стол: «${deck[0].name}» · «${deck[1].name}» · «${deck[2].name}». Зарегистрируйтесь — мастер расшифрует расклад.`;
    saveGuestTriplet({
      tarotCards: deck,
      deckSystem: system,
      teaser,
      completedAt: new Date().toISOString(),
    });
    setDone(true);
  };

  return (
    <div className="mx-auto mb-12 max-w-3xl">
      <p className="lux-label mb-8 text-center">
        Бесплатный расклад · 3 карты до регистрации
      </p>

      <div className="mb-10 flex flex-wrap items-end justify-center gap-5 sm:gap-8">
        {deck.map((card, i) => (
          <div key={`${card.id}-${card.name}`} className="flex flex-col items-center gap-2">
            <p className="lux-label">{positions[i]}</p>
            <button
              type="button"
              onClick={() => handleFlip(i)}
              disabled={revealed[i]}
              className="perspective-1000 h-[220px] w-[140px] sm:h-[236px] sm:w-[148px]"
              aria-label={revealed[i] ? card.name : `Открыть ${positions[i]}`}
            >
              <motion.div
                className="relative h-full w-full preserve-3d"
                animate={{ rotateY: revealed[i] ? 180 : 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="absolute inset-0 backface-hidden">
                  <SymbolCardFace
                    card={card}
                    system={system}
                    faceDown
                    showMeaning={false}
                    size="md"
                    className="h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none"
                  />
                </div>
                <div className="absolute inset-0 backface-hidden rotate-y-180">
                  <SymbolCardFace
                    card={card}
                    system={system}
                    showMeaning={false}
                    size="md"
                    className="h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none"
                  />
                </div>
              </motion.div>
            </button>
          </div>
        ))}
      </div>

      {allRevealed && !done && (
        <div className="text-center">
          <button type="button" onClick={handleFinish} className="btn-primary px-10 py-3.5">
            Сохранить расклад и продолжить
          </button>
        </div>
      )}

      {done && (
        <motion.div
          className="glass-panel mx-auto max-w-md space-y-5 p-8 text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <p className="text-sm leading-relaxed text-aura-ivory/75">
            Расклад сохранён. Остался один шаг — быстрая регистрация и выбор мастера.
          </p>
          <Link href="/auth/user/register?returnTo=/" className="btn-primary inline-block px-10 py-3.5">
            Получить расшифровку
          </Link>
        </motion.div>
      )}
    </div>
  );
}
