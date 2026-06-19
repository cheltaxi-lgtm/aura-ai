"use client";

import { motion } from "framer-motion";
import { RefreshCw, Sparkles } from "lucide-react";
import { getCharacterById } from "@/lib/characters";
import { findShowcaseMaster, type ShowcaseMaster } from "@/lib/showcase-masters";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { DeckSystem } from "@/lib/decks/types";
import TarotCardsRow from "@/components/TarotCardsRow";

interface ReadingRecapProps {
  userName: string;
  zodiac: string;
  tarotCards: SpreadSymbol[];
  deckSystem?: DeckSystem;
  teaser?: string;
  lastMasterId?: string | null;
  masters?: ShowcaseMaster[];
  onContinue?: () => void;
  onNewReading: () => void;
  /** Можно ли начать новый расклад (лимит 1 раз в сутки) */
  newReadingAllowed?: boolean;
  /** Подпись, когда расклад временно недоступен */
  newReadingCooldownHint?: string;
  onUnlock?: () => void;
  /** Подпись кнопки разблокировки (руны или ₽) */
  unlockLabel?: string;
  /** Подсказка о цене, если кнопка ₽ скрыта */
  readingHint?: string;
}

export default function ReadingRecap({
  userName,
  zodiac,
  tarotCards,
  deckSystem,
  teaser,
  lastMasterId,
  masters,
  onContinue,
  onNewReading,
  newReadingAllowed = true,
  newReadingCooldownHint,
  onUnlock,
  unlockLabel = "199 ₽",
  readingHint,
}: ReadingRecapProps) {
  const lastMaster = lastMasterId
    ? findShowcaseMaster(lastMasterId, masters) ?? getCharacterById(lastMasterId)
    : null;

  return (
    <motion.div
      id="мой-расклад"
      className="glass-panel mx-auto mb-10 max-w-3xl p-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500">Ваш расклад готов</p>
          <p className="font-display text-lg font-semibold text-white">
            {userName} · {zodiac}
          </p>
        </div>
        <button
          type="button"
          onClick={onNewReading}
          disabled={!newReadingAllowed}
          title={newReadingCooldownHint}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${
            newReadingAllowed
              ? "border-white/10 text-gray-400 hover:border-white/25 hover:text-white"
              : "cursor-not-allowed border-white/5 text-gray-600"
          }`}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Новый расклад
        </button>
      </div>

      {!newReadingAllowed && newReadingCooldownHint && (
        <p className="-mt-2 mb-4 text-right text-[10px] text-gray-600">{newReadingCooldownHint}</p>
      )}

      {tarotCards.length >= 3 ? (
        <div className="mb-6 rounded-2xl border border-aura-gold/15 bg-black/20 p-4 sm:p-5">
          <p className="mb-4 text-center text-xs uppercase tracking-widest text-aura-gold">
            Три карты вашего расклада
          </p>
          <TarotCardsRow cards={tarotCards.slice(0, 3)} system={deckSystem} size="lg" />
        </div>
      ) : (
        <p className="mb-4 text-sm text-amber-400/90">
          Карты расклада не найдены — нажмите «Новый расклад», чтобы выпустить три карты заново.
        </p>
      )}

      <p className="text-sm leading-relaxed text-gray-300">
        {teaser ?? "Выберите мастера ниже — он расшифрует ваш расклад и ответит на вопросы."}
      </p>

      {readingHint && (
        <p className="mt-3 text-xs text-aura-gold">{readingHint}</p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {lastMaster && onContinue && (
          <button onClick={onContinue} className="btn-neon px-5 py-2.5 text-sm">
            Продолжить с {lastMaster.name} {lastMaster.emoji}
          </button>
        )}
        {onUnlock && (
          <button
            onClick={onUnlock}
            className="flex items-center gap-2 rounded-xl border border-aura-gold/30 px-5 py-2.5 text-sm text-aura-gold transition-colors hover:border-aura-gold/60"
          >
            <Sparkles className="h-4 w-4" />
            Открыть полный разбор — {unlockLabel}
          </button>
        )}
      </div>
    </motion.div>
  );
}
