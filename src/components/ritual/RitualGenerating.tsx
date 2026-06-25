"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const RAGNAR_RUNES = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ"];
const AGAFYA_SYMBOLS = ["🌿", "🧵", "💧", "🌾", "✨"];

const MESSAGES = [
  "читает карты…",
  "руны указывают путь…",
  "обряд складывается…",
  "почти готово…",
];

interface Props {
  characterKey: string;
  ritualId: string;
  onReady: () => void;
}

export default function RitualGenerating({
  characterKey,
  ritualId,
  onReady,
}: Props) {
  const [msgIndex, setMsgIndex] = useState(0);
  const masterName = characterKey === "ragnar" ? "Рагнар" : "Агафья";
  const symbols = characterKey === "ragnar" ? RAGNAR_RUNES : AGAFYA_SYMBOLS;

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const res = await fetch(`/api/ritual/${ritualId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.ritual?.status === "completed") {
              onReady();
              return;
            }
          }
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [ritualId, onReady]);

  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-10">
      <div className="relative mb-8 flex h-32 w-32 items-center justify-center">
        {symbols.map((sym, i) => (
          <motion.span
            key={i}
            className="absolute text-2xl"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0.5, 1.2, 0.5],
              x: Math.cos((i / symbols.length) * Math.PI * 2) * 40,
              y: Math.sin((i / symbols.length) * Math.PI * 2) * 40,
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.25,
            }}
          >
            {sym}
          </motion.span>
        ))}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="h-16 w-16 rounded-full border-2 border-amber-400/30 border-t-amber-400"
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={msgIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="text-center text-sm text-amber-200/80"
        >
          {masterName} {MESSAGES[msgIndex]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
