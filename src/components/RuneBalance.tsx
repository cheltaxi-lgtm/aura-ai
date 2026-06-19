"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const RUNE_BALANCE_EVENT = "aura:rune-balance";

export function emitRuneBalanceUpdate(balance: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RUNE_BALANCE_EVENT, { detail: balance }));
}

interface RuneBalanceProps {
  onBuyClick: () => void;
  compact?: boolean;
}

export default function RuneBalance({ onBuyClick, compact = false }: RuneBalanceProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [prevBalance, setPrevBalance] = useState(0);
  const [showDiff, setShowDiff] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/runes/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (typeof d?.balance === "number") {
          setBalance(d.balance);
          setPrevBalance(d.balance);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<number>).detail;
      if (typeof next !== "number") return;
      setBalance((prev) => {
        if (prev !== null && prev !== next) {
          setShowDiff(next - prev);
          setPrevBalance(prev);
          setTimeout(() => setShowDiff(null), 2000);
        }
        return next;
      });
    };
    window.addEventListener(RUNE_BALANCE_EVENT, handler);
    return () => window.removeEventListener(RUNE_BALANCE_EVENT, handler);
  }, []);

  if (balance === null) {
    return <div className="h-8 w-16 animate-pulse rounded-xl bg-white/5" />;
  }

  const isLow = balance < 15;

  return (
    <div className="relative flex shrink-0 items-center gap-1 sm:gap-2">
      <button
        type="button"
        onClick={onBuyClick}
        className={`flex items-center gap-1 rounded-xl border font-semibold transition-all hover:scale-105 active:scale-95 ${
          compact ? "px-2 py-1.5 text-[11px]" : "gap-1.5 px-3 py-1.5 text-xs"
        } ${
          isLow
            ? "animate-pulse border-amber-500/60 bg-amber-500/15 text-amber-300"
            : "border-white/15 bg-white/5 text-white/80"
        }`}
        aria-label={`Баланс рун: ${balance}`}
      >
        <span className={`leading-none ${compact ? "text-sm" : "text-base"}`}>ᚢ</span>
        <motion.span
          key={balance}
          initial={{ scale: 1.3, color: "#fbbf24" }}
          animate={{ scale: 1, color: "#ffffff" }}
          transition={{ duration: 0.4 }}
        >
          {balance}
        </motion.span>
      </button>

      <AnimatePresence>
        {showDiff !== null && (
          <motion.span
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: -24 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 }}
            className={`pointer-events-none absolute -top-5 left-2 text-xs font-bold ${
              showDiff > 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {showDiff > 0 ? `+${showDiff}` : showDiff} ᚢ
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
