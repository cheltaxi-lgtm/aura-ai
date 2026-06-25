"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2 } from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import MySpreadsGallery, { type MySpreadEntry } from "@/components/MySpreadsGallery";
import DeckCardsRow from "@/components/DeckCardsRow";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import { masterDisplay } from "@/lib/cabinet-utils";
import type { CabinetPhotoSpreadRow } from "@/lib/cabinet-data";
import type { DeckSystem } from "@/lib/decks/types";
import type { RedrawSpread } from "@/lib/photo-spread-redraw";
import { redrawSpreadToTarotCards } from "@/lib/photo-spread-redraw";

interface Props {
  spreads: CabinetPhotoSpreadRow[];
  onDelete?: (id: string) => void;
  deletingId?: string | null;
}

function toGalleryEntries(spreads: CabinetPhotoSpreadRow[]): MySpreadEntry[] {
  return spreads.map((s) => ({
    id: s.id,
    characterName: s.characterName,
    createdAt: s.createdAt,
    contextData: {
      ...s.contextData,
      deckSystem: s.contextData.deckSystem as DeckSystem | undefined,
      redrawSpread: s.contextData.redrawSpread as RedrawSpread | undefined,
    },
  }));
}

export default function CabinetPhotoSpreads({ spreads, onDelete, deletingId = null }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = spreads.find((s) => s.id === activeId) ?? null;

  useEffect(() => {
    if (activeId && !spreads.some((s) => s.id === activeId)) {
      setActiveId(null);
    }
  }, [activeId, spreads]);

  const masterLabel = (id: string) => masterDisplay(id).name;

  const activeCards = active?.contextData.redrawSpread?.cards?.length
      ? redrawSpreadToTarotCards(active.contextData.redrawSpread)
      : (active?.contextData.tarotCards ?? []).map((c) => ({
          name: c.name,
          meaning: c.meaning,
        }));

  const activeSystem =
    (active?.contextData.deckSystem as DeckSystem | undefined) ??
    active?.contextData.redrawSpread?.system ??
    DEFAULT_DECK_SYSTEM;

  return (
    <section id="мои-расклады" className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-white">Мои фото-расклады</h2>
        <p className="mt-1 text-sm text-gray-500">
          Распознанные расклады с картами и расшифровкой мастера
        </p>
      </div>

      <MySpreadsGallery
        entries={toGalleryEntries(spreads)}
        masterLabel={masterLabel}
        onOpen={setActiveId}
        onDelete={onDelete}
        deletingId={deletingId}
      />

      <BodyPortal active={Boolean(active)}>
        <AnimatePresence>
          {active && (
            <motion.div
              className="app-modal-overlay fixed inset-0 z-[4990] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4 pointer-events-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
            <button
              type="button"
              className="absolute inset-0"
              aria-label="Закрыть"
              onClick={() => setActiveId(null)}
            />
            <motion.div
              className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-6 shadow-xl sm:rounded-3xl"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-aura-gold">{masterLabel(active.characterName)}</p>
                  <h3 className="font-display text-lg font-semibold text-white">Фото-расклад</h3>
                  <time className="text-xs text-gray-500">
                    {new Date(active.createdAt).toLocaleString("ru")}
                  </time>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveId(null)}
                  className="rounded-full border border-white/10 p-2 text-gray-400 hover:text-white"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {activeCards.length > 0 && (
                <div className="mb-4 rounded-2xl border border-aura-gold/15 bg-black/30 p-4">
                  <DeckCardsRow
                    cards={activeCards}
                    system={activeSystem}
                    masterId={active.characterName}
                    size="md"
                    aligned
                    enableDetail
                  />
                </div>
              )}

              {active.contextData.question ? (
                <p className="mb-3 text-sm text-gray-400">
                  Вопрос: {active.contextData.question}
                </p>
              ) : null}

              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                  {active.contextData.analysis ?? "Расшифровка недоступна"}
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`/?master=${encodeURIComponent(active.characterName)}&resume=chat`}
                  className="cabinet-btn cabinet-btn--primary flex-1"
                >
                  Перейти в чат с мастером
                </Link>
                {onDelete ? (
                  <button
                    type="button"
                    disabled={deletingId === active.id}
                    onClick={() => onDelete(active.id)}
                    className="cabinet-btn cabinet-btn--danger shrink-0"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                    {deletingId === active.id ? "Удаление…" : "Удалить"}
                  </button>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
          )}
        </AnimatePresence>
      </BodyPortal>
    </section>
  );
}
