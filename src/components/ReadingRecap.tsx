"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Sparkles, Layers } from "lucide-react";
import { getCharacterById } from "@/lib/characters";
import { findShowcaseMaster, type ShowcaseMaster } from "@/lib/showcase-masters";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { DeckSystem } from "@/lib/decks/types";
import { getDeckPositions, resolveMasterDeckSystem } from "@/lib/decks";
import { buildSpreadTeaser } from "@/lib/spread-teaser";
import { getZodiacFromDate } from "@/utils/zodiac";
import { useTripletCountdown } from "@/hooks/useTripletCountdown";
import DeckCardsRow from "@/components/DeckCardsRow";
import ZodiacGlyph from "@/components/ZodiacGlyph";
import MasterSigil from "@/components/MasterSigil";

interface ReadingRecapProps {
  userName: string;
  birthDate?: string;
  tarotCards: SpreadSymbol[];
  deckSystem?: DeckSystem;
  teaser?: string;
  lastMasterId?: string | null;
  masters?: ShowcaseMaster[];
  onContinue?: () => void;
  onNewReading: () => void;
  cooldownReady?: boolean;
  nextAvailableAt?: string | null;
  onUnlock?: () => void;
  unlockLabel?: string;
  readingHint?: string;
  onOpenGallery?: () => void;
}

function zodiacFromBirthDate(birthDate?: string) {
  if (!birthDate?.trim()) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  return getZodiacFromDate(birthDate);
}

export default function ReadingRecap({
  userName,
  birthDate,
  tarotCards,
  deckSystem,
  teaser,
  lastMasterId,
  masters,
  onContinue,
  onNewReading,
  cooldownReady = true,
  nextAvailableAt,
  onUnlock,
  unlockLabel = "199 ₽",
  readingHint,
  onOpenGallery,
}: ReadingRecapProps) {
  const countdown = useTripletCountdown(nextAvailableAt);
  const newReadingAllowed = cooldownReady && !countdown.isOnCooldown;

  const lastMaster = lastMasterId
    ? findShowcaseMaster(lastMasterId, masters) ?? getCharacterById(lastMasterId)
    : null;

  const galleryMaster =
    lastMaster ??
    masters?.find((m) => m.system === deckSystem) ??
    masters?.[0];

  const system = deckSystem ?? (galleryMaster ? resolveMasterDeckSystem(galleryMaster.id) : undefined);
  const positions = system
    ? [...getDeckPositions(system)]
    : ["Прошлое", "Настоящее", "Будущее"];

  const zodiacSign = zodiacFromBirthDate(birthDate);

  const teaserText = useMemo(() => {
    if (tarotCards.length >= 3) {
      return buildSpreadTeaser({
        userName,
        cards: tarotCards,
        positions,
        masterName: lastMaster?.name,
      });
    }
    return (
      teaser ??
      (lastMaster
        ? `${userName}, продолжите с ${lastMaster.name}, чтобы услышать полную расшифровку.`
        : "Выберите мастера ниже — он расшифрует ваш расклад и ответит на вопросы.")
    );
  }, [tarotCards, userName, positions, lastMaster, teaser]);

  const handleNewReading = () => {
    if (!newReadingAllowed) return;
    onNewReading();
  };

  return (
    <motion.div
      id="мой-расклад"
      className="glass-panel mx-auto mb-6 max-w-3xl p-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold text-white sm:text-xl">
            Ваш расклад готов
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 font-display text-sm text-aura-ivory/85">
            <span className="uppercase tracking-wide">{userName}</span>
            {zodiacSign ? (
              <>
                <span className="text-aura-champagne/50">·</span>
                <span className="inline-flex items-center gap-1">
                  {zodiacSign.name}
                  <ZodiacGlyph signName={zodiacSign.name} className="h-3.5 w-3.5" />
                </span>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={handleNewReading}
          disabled={!newReadingAllowed}
          title={countdown.tooltip || "Выпустить новый расклад из 3 карт"}
          className={`btn-new-spread ${newReadingAllowed ? "btn-new-spread--active" : "btn-new-spread--cooldown"}`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${newReadingAllowed ? "" : "opacity-60"}`} />
          Новый расклад
        </button>
      </div>

      {!newReadingAllowed && countdown.hintRu ? (
        <p className="-mt-1 mb-4 text-right text-xs tabular-nums text-aura-champagne/80">
          {countdown.hintRu}
        </p>
      ) : null}

      {tarotCards.length >= 3 ? (
        <div className="mb-5 rounded-2xl border border-aura-gold/15 bg-black/20 p-4 sm:p-5">
          <p className="mb-4 text-center text-xs uppercase tracking-widest text-aura-gold">
            Нажмите на карту для подробностей
          </p>
          <DeckCardsRow
            cards={tarotCards.slice(0, 3)}
            system={system}
            masterId={galleryMaster?.id}
            size="lg"
            enableDetail
            aligned
          />
          {onOpenGallery && galleryMaster && system ? (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={onOpenGallery}
                className="inline-flex items-center gap-2 text-xs text-aura-champagne/80 underline-offset-4 transition-colors hover:text-aura-champagne hover:underline"
              >
                <Layers className="h-3.5 w-3.5" />
                Вся колода {galleryMaster.name}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mb-4 text-sm text-amber-400/90">
          Карты расклада не найдены — нажмите «Новый расклад», чтобы выпустить три карты заново.
        </p>
      )}

      <p className="text-sm leading-relaxed text-gray-300">{teaserText}</p>

      {readingHint ? (
        <p className="mt-3 text-xs text-aura-gold/90">{readingHint}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        {lastMaster && onContinue ? (
          <button
            onClick={onContinue}
            className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm"
          >
            Продолжить с {lastMaster.name}
            <MasterSigil masterId={lastMaster.id} className="h-4 w-4 text-[#1a1208]/80" />
          </button>
        ) : null}
        {onUnlock ? (
          <button
            onClick={onUnlock}
            className="flex items-center gap-2 rounded-xl border border-aura-gold/30 px-5 py-2.5 text-sm text-aura-gold transition-colors hover:border-aura-gold/60"
          >
            <Sparkles className="h-4 w-4" />
            Открыть полный разбор — {unlockLabel}
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}
