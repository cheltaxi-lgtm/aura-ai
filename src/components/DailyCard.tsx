"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { DAILY_CARDS, getCharacterById } from "@/lib/characters";
import MasterAvatar from "@/components/MasterAvatar";

interface DailyCardProps {
  sessionId?: string;
  characterId?: string;
  userName?: string;
  zodiac?: string;
}

export default function DailyCard({
  sessionId,
  characterId = "veronika",
  userName,
  zodiac,
}: DailyCardProps) {
  const master = getCharacterById(characterId);
  const [isFlipped, setIsFlipped] = useState(false);
  const [prediction, setPrediction] = useState<{ name: string; meaning: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFlip = async () => {
    if (isFlipped || loading) return;

    const card = DAILY_CARDS[Math.floor(Math.random() * DAILY_CARDS.length)];
    setLoading(true);
    setIsFlipped(true);

    try {
      const res = await fetch("/api/daily-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardName: card.name,
          sessionId,
          characterId,
          userName,
          zodiac,
        }),
      });
      const data = await res.json();
      setPrediction({ name: card.name, meaning: data.prediction ?? card.meaning });
    } catch {
      setPrediction(card);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setIsFlipped(false);
    setPrediction(null);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-sm uppercase tracking-[0.3em] text-aura-purple/80">
        Карта дня · {master?.name ?? "мастер"} · бесплатно
      </p>

      <div
        className="perspective-1000 h-64 w-44 cursor-pointer md:h-72 md:w-48"
        onClick={!isFlipped ? handleFlip : undefined}
      >
        <motion.div
          className="relative h-full w-full preserve-3d"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.35, type: "spring", stiffness: 120 }}
        >
          <div className="absolute inset-0 backface-hidden rounded-2xl border border-aura-purple/30 bg-gradient-to-br from-purple-950/80 via-aura-bg to-emerald-950/60 shadow-neon">
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
              <MasterAvatar masterId={characterId} masterName={master?.name} size="lg" />
              <p className="text-center text-sm text-gray-400">
                Нажмите, чтобы
                <br />
                открыть карту
              </p>
            </div>
          </div>

          <div className="absolute inset-0 rotate-y-180 backface-hidden rounded-2xl border border-aura-emerald/40 bg-gradient-to-br from-emerald-950/80 via-aura-bg to-amber-950/40 shadow-neon-emerald">
            <div className="flex h-full flex-col items-center justify-center gap-3 p-5">
              <span className="text-3xl">✨</span>
              <h3 className="font-display text-lg font-bold text-aura-gold">
                {prediction?.name ?? "..."}
              </h3>
              <p className="text-center text-xs leading-relaxed text-gray-300">
                {loading ? "Считываем знаки..." : prediction?.meaning}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {isFlipped && !loading && (
        <motion.button
          className="text-sm text-aura-purple/70 hover:text-aura-neon hover:underline"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={handleReset}
        >
          Вытянуть новую карту
        </motion.button>
      )}
    </div>
  );
}
