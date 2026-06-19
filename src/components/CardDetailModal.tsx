"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { DeckSystem } from "@/lib/decks/types";
import type { ResolvedDeckCard } from "@/lib/deck-card-utils";
import { DECK_ACCENT_CLASS } from "@/lib/deck-card-utils";

interface CardDetailModalProps {
  open: boolean;
  cards: ResolvedDeckCard[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  positionLabel?: string;
}

export default function CardDetailModal({
  open,
  cards,
  index,
  onIndexChange,
  onClose,
  positionLabel,
}: CardDetailModalProps) {
  const touchStartX = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const card = cards[index];
  const hasPrev = index > 0;
  const hasNext = index < cards.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(index - 1);
  }, [hasPrev, index, onIndexChange]);

  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(index + 1);
  }, [hasNext, index, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, goPrev, goNext]);

  if (!mounted || !open || !card) return null;

  const accent = DECK_ACCENT_CLASS[card.system];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/90 p-0 backdrop-blur-md sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={card.name}
        >
          <motion.div
            className="relative flex max-h-[96vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-aura-gold/20 bg-gradient-to-b from-[#1a1428] to-[#0a0814] shadow-2xl sm:rounded-3xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              touchStartX.current = e.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(e) => {
              if (touchStartX.current == null) return;
              const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
              if (dx > 60) goPrev();
              else if (dx < -60) goNext();
              touchStartX.current = null;
            }}
          >
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 sm:px-5">
              <div>
                {positionLabel && (
                  <p className="lux-label text-[10px]">{positionLabel}</p>
                )}
                <h2 className="font-display text-lg font-semibold text-[#EDE6DA]">
                  {card.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-aura-ivory/70 transition-colors hover:bg-white/10"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-5 sm:px-6">
              <div
                className={`lux-deck-card lux-tarot-card lux-tarot-card--photo lux-deck-card--lg ${accent} mx-auto max-w-[220px]`}
              >
                <div className="lux-tarot-card__frame" aria-hidden />
                <div className="lux-tarot-card__inner lux-tarot-card__inner--photo">
                  <div className="lux-tarot-card__image-wrap aspect-[2/3]">
                    <Image
                      src={card.imagePath}
                      alt={card.name}
                      fill
                      className="lux-tarot-card__image object-cover"
                      sizes="220px"
                      unoptimized
                    />
                    <div className="lux-tarot-card__image-vignette" aria-hidden />
                  </div>
                </div>
                <div className="lux-tarot-card__sheen" aria-hidden />
              </div>

              {card.keywords.length > 0 && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {card.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="rounded-full border border-aura-gold/35 bg-aura-gold/10 px-3 py-1 text-[11px] font-medium text-aura-champagne"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}

              <p className="mt-5 text-center text-sm leading-relaxed text-aura-ivory/75">
                {card.fullMeaning}
              </p>
            </div>

            {cards.length > 1 && (
              <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={!hasPrev}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-aura-ivory/60 transition-colors hover:text-aura-champagne disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Назад
                </button>
                <span className="text-[10px] text-aura-ivory/40">
                  {index + 1} / {cards.length}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!hasNext}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-aura-ivory/60 transition-colors hover:text-aura-champagne disabled:opacity-30"
                >
                  Далее
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
