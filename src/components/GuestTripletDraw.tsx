"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { drawRandomCards, TRIPLET_POSITIONS, type TarotCard } from "@/lib/tarot";
import { saveGuestTriplet } from "@/lib/guest-triplet";

export default function GuestTripletDraw() {
  const [deck] = useState(() => drawRandomCards(3));
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
      teaser,
      completedAt: new Date().toISOString(),
    });
    setDone(true);
  };

  return (
    <div className="mx-auto mb-10 max-w-3xl">
      <p className="mb-6 text-center text-xs uppercase tracking-[0.25em] text-aura-purple/80">
        Бесплатный расклад · 3 карты до регистрации
      </p>

      <div className="mb-8 flex flex-wrap items-end justify-center gap-4 sm:gap-6">
        {deck.map((card, i) => (
          <div key={card.id} className="flex flex-col items-center gap-2">
            <p className="text-[10px] uppercase tracking-widest text-aura-gold sm:text-xs">
              {TRIPLET_POSITIONS[i]}
            </p>
            <button
              type="button"
              onClick={() => handleFlip(i)}
              disabled={revealed[i]}
              className="perspective-1000 h-44 w-28 sm:h-52 sm:w-36"
              aria-label={revealed[i] ? card.name : `Открыть карту ${TRIPLET_POSITIONS[i]}`}
            >
              <motion.div
                className="relative h-full w-full preserve-3d"
                animate={{ rotateY: revealed[i] ? 180 : 0 }}
                transition={{ duration: 0.35, type: "spring", stiffness: 120 }}
              >
                <div className="absolute inset-0 backface-hidden ui-card flex items-center justify-center border border-aura-purple/30 bg-gradient-to-br from-purple-950/80 to-aura-bg">
                  <span className="text-3xl">🃏</span>
                </div>
                <div className="absolute inset-0 rotate-y-180 backface-hidden ui-card flex flex-col items-center justify-center gap-1 border border-aura-emerald/40 bg-gradient-to-br from-emerald-950/70 to-aura-bg p-3 text-center">
                  <p className="font-display text-xs font-semibold text-aura-gold sm:text-sm">{card.name}</p>
                  <p className="text-[10px] leading-snug text-gray-400 sm:text-xs">{card.meaning}</p>
                </div>
              </motion.div>
            </button>
          </div>
        ))}
      </div>

      {allRevealed && !done && (
        <div className="text-center">
          <button type="button" onClick={handleFinish} className="btn-neon px-8 py-3">
            Сохранить расклад и продолжить
          </button>
        </div>
      )}

      {done && (
        <motion.div
          className="glass-panel mx-auto max-w-md space-y-4 p-6 text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <p className="text-sm text-gray-300">
            Расклад сохранён. Остался один шаг — быстрая регистрация и выбор мастера.
          </p>
          <Link
            href="/auth/user/register?returnTo=/"
            className="btn-neon inline-block px-8 py-3"
          >
            Получить расшифровку
          </Link>
        </motion.div>
      )}
    </div>
  );
}
