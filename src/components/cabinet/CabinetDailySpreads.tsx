"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, X } from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import DeckCardsRow from "@/components/DeckCardsRow";
import ChatMessageRenderer from "@/components/ChatMessageRenderer";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import { masterDisplay, formatShortDate } from "@/lib/cabinet-utils";
import type { CabinetDailyReadingRow } from "@/lib/cabinet-data";
import type { DeckSystem } from "@/lib/decks/types";

interface Props {
  readings: CabinetDailyReadingRow[];
}

export default function CabinetDailySpreads({ readings }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = readings.find((r) => r.id === activeId) ?? null;

  useEffect(() => {
    if (activeId && !readings.some((r) => r.id === activeId)) {
      setActiveId(null);
    }
  }, [activeId, readings]);

  if (readings.length === 0) return null;

  const activeSystem = (active?.deckSystem as DeckSystem | undefined) ?? DEFAULT_DECK_SYSTEM;

  return (
    <section id="расклады-на-сутки" className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-white">Расклады на сутки</h2>
        <p className="mt-1 text-sm text-gray-500">
          Бесплатная энергия дня — утро, день и вечер
        </p>
      </div>

      <div className="space-y-2">
        {readings.map((item) => {
          const master = masterDisplay(item.characterKey);
          const cardPreview = item.cards.map((c) => c.name).slice(0, 3).join(" · ");
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              className="cabinet-card flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:border-amber-500/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-lg">
                <Moon className="h-5 w-5 text-amber-300" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {formatShortDate(`${item.readingDate}T12:00:00`)} · {master.name}
                </p>
                <p className="truncate text-xs text-gray-500">{cardPreview || "Три карты"}</p>
              </div>
            </button>
          );
        })}
      </div>

      <BodyPortal active={Boolean(active)}>
        <AnimatePresence>
          {active && (
            <motion.div
              className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
                onClick={() => setActiveId(null)}
                aria-label="Закрыть"
              />
              <motion.div
                className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-amber-500/15 bg-[#0d0a1a] sm:rounded-3xl"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
              >
                <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400/80">
                      Расклад на сутки
                    </p>
                    <p className="font-display text-lg text-white">
                      {formatShortDate(`${active.readingDate}T12:00:00`)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveId(null)}
                    className="rounded-full border border-white/10 p-1.5 text-gray-400 hover:text-white"
                    aria-label="Закрыть"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="lux-scroll flex-1 overflow-y-auto px-5 py-5">
                  {active.cards.length >= 3 ? (
                    <DeckCardsRow
                      cards={active.cards.map((c) => ({
                        name: c.name,
                        meaning: c.meaning,
                      }))}
                      system={activeSystem}
                      masterId={active.characterKey}
                      size="sm"
                      positions={active.cards.map((c) => c.position ?? c.name)}
                      showMeaning={false}
                    />
                  ) : null}
                  <div className="mt-5 rounded-2xl border border-amber-500/12 bg-black/20 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-amber-400/80">
                      Энергия дня · {masterDisplay(active.characterKey).name}
                    </p>
                    <div className="mt-3 text-sm leading-relaxed text-gray-200">
                      <ChatMessageRenderer content={active.readingText} />
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </BodyPortal>
    </section>
  );
}
