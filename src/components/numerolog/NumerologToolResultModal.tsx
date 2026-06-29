"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import PythagorasSquareGrid from "@/components/PythagorasSquareGrid";
import ChatMessageRenderer from "@/components/ChatMessageRenderer";
import type { PythagorasSquareResult } from "@/lib/numerology/pythagoras-square";

export interface NumerologToolResultState {
  toolLabel: string;
  loading: boolean;
  reply?: string;
  numerologyUi?: { pythagorasSquare?: PythagorasSquareResult };
  error?: string;
}

interface NumerologToolResultModalProps {
  open: boolean;
  state: NumerologToolResultState | null;
  onClose: () => void;
}

export default function NumerologToolResultModal({
  open,
  state,
  onClose,
}: NumerologToolResultModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !state?.loading) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, state?.loading]);

  if (!mounted || !open || !state) return null;

  const pythagoras = state.numerologyUi?.pythagorasSquare;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9997] flex items-end justify-center bg-black/85 p-0 backdrop-blur-md sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (!state.loading) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label={state.toolLabel}
        >
          <motion.div
            className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-aura-gold/20 bg-gradient-to-b from-[#17122a] to-[#0a0814] shadow-2xl sm:rounded-3xl"
            initial={{ y: 32, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-aura-gold/55">
                  Расчёт Эвелины
                </p>
                <h2 className="text-base font-semibold text-aura-champagne sm:text-lg">
                  {state.toolLabel}
                </h2>
              </div>
              {!state.loading ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-white/10 p-2 text-gray-300 transition hover:border-aura-gold/30 hover:text-white"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="overflow-y-auto px-4 py-4 sm:px-5">
              {state.loading ? (
                <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-aura-gold/80" />
                  <p className="text-sm text-gray-300">Считаю числа и готовлю расшифровку…</p>
                </div>
              ) : state.error ? (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {state.error}
                </p>
              ) : (
                <div className="space-y-4">
                  {pythagoras ? (
                    <div className="rounded-2xl border border-aura-gold/15 bg-black/20 p-3">
                      <PythagorasSquareGrid square={pythagoras} />
                    </div>
                  ) : null}
                  {state.reply ? (
                    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-relaxed text-gray-100">
                      <ChatMessageRenderer content={state.reply} />
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {!state.loading ? (
              <div className="border-t border-white/10 px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl border border-aura-gold/35 bg-aura-gold/10 px-4 py-2.5 text-sm font-semibold text-aura-gold transition hover:bg-aura-gold/20"
                >
                  Продолжить в чате
                </button>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
