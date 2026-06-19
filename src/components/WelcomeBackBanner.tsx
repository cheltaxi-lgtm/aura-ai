"use client";

import { motion } from "framer-motion";
import { findShowcaseMaster, type ShowcaseMaster } from "@/lib/showcase-masters";
import MasterAvatar from "@/components/MasterAvatar";

interface WelcomeBackBannerProps {
  userName?: string;
  masterId: string;
  masters: ShowcaseMaster[];
  onContinue: (masterId: string) => void;
}

export default function WelcomeBackBanner({
  userName,
  masterId,
  masters,
  onContinue,
}: WelcomeBackBannerProps) {
  const master = findShowcaseMaster(masterId, masters);
  const label = master?.name ?? "мастером";

  return (
    <motion.div
      className="glass-panel mb-8 flex flex-col items-start gap-4 border-aura-purple/30 p-5 sm:flex-row sm:items-center sm:justify-between"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-start gap-4">
        <MasterAvatar masterId={masterId} masterName={master?.name} size="lg" hoverZoom />
        <div>
          <p className="font-display text-base font-semibold text-white">
            {userName ? `${userName}, добро пожаловать обратно` : "Добро пожаловать обратно"}
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Ваш расклад сохранён — продолжите диалог с {label}.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onContinue(masterId)}
        className="btn-neon w-full shrink-0 px-6 py-2.5 sm:w-auto"
      >
        Продолжить с {label}
      </button>
    </motion.div>
  );
}
