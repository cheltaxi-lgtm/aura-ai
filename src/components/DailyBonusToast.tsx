"use client";

import { motion } from "framer-motion";

export default function DailyBonusToast({ amount }: { amount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: "-50%", y: 16 }}
      animate={{ opacity: 1, x: "-50%", y: 0 }}
      exit={{ opacity: 0, x: "-50%", y: 8 }}
      className="fixed bottom-24 left-1/2 z-50 flex w-max max-w-[calc(100%-2rem)] items-center gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 px-6 py-3 backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <span className="text-2xl leading-none">ᚢ</span>
      <div>
        <p className="text-sm font-semibold text-white">+{amount} рун за посещение</p>
        <p className="text-xs text-white/50">Следующий бонус — через 24 часа</p>
      </div>
    </motion.div>
  );
}
