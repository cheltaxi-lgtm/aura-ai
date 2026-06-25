"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

interface DailyEnergyBlockProps {
  characterKey?: string;
  onTalkToMaster?: () => void;
}

export default function DailyEnergyBlock({ characterKey = "veronika", onTalkToMaster }: DailyEnergyBlockProps) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/daily-reading?characterKey=${encodeURIComponent(characterKey)}`);
        if (res.ok) {
          const data = await res.json();
          setText(data.text ?? null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [characterKey]);

  if (loading) {
    return (
      <div className="mb-8 rounded-2xl border border-white/10 bg-black/30 p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
        <div className="mt-4 h-16 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  if (!text) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-900/15 to-black/40 p-6"
    >
      <p className="text-[10px] uppercase tracking-widest text-amber-400/80">Энергия дня</p>
      <p className="mt-3 text-sm leading-relaxed text-gray-200">{text}</p>
      {onTalkToMaster && (
        <button
          type="button"
          onClick={onTalkToMaster}
          className="group mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-medium btn-primary sm:w-auto"
        >
          Поговорить с мастером
          <ArrowRight
            className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5"
            aria-hidden
          />
        </button>
      )}
    </motion.div>
  );
}
