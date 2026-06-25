"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  toast: { message: string; retryAfter: number } | null;
  onDismiss: () => void;
}

export default function RateLimitToast({ toast, onDismiss }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!toast) return;
    const showCountdown = toast.retryAfter < 300;
    if (!showCountdown) {
      const t = setTimeout(onDismiss, 5000);
      return () => clearTimeout(t);
    }
    setSecondsLeft(toast.retryAfter);
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          onDismiss();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [toast, onDismiss]);

  const showCountdown = toast && toast.retryAfter < 300;

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          className="fixed bottom-24 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-amber-500/40 bg-[#1a1520] px-4 py-3 shadow-xl"
          role="alert"
        >
          <p className="text-sm text-amber-100">{toast.message}</p>
          {showCountdown && secondsLeft > 0 ? (
            <p className="mt-1 text-xs text-amber-400/80">
              Повторите через {secondsLeft} сек.
            </p>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
