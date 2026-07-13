"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, RefreshCw, Sparkles, Layers } from "lucide-react";
import { getCharacterById } from "@/lib/characters";
import { findShowcaseMaster, type ShowcaseMaster } from "@/lib/showcase-masters";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { DeckSystem } from "@/lib/decks/types";
import { resolveMasterDeckSystem } from "@/lib/decks";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import { reconcileSpreadDeck } from "@/lib/spread-context";
import { buildSpreadTeaser } from "@/lib/spread-teaser";
import {
  DEFAULT_SPREAD_ID,
  getSpread,
  hasCompleteSpread,
  normalizeSpreadId,
  resolveSpreadPositions,
  type SpreadId,
} from "@/lib/spreads";
import { getZodiacFromDate } from "@/utils/zodiac";
import { useTripletCountdown } from "@/hooks/useTripletCountdown";
import DeckCardsRow from "@/components/DeckCardsRow";
import ZodiacGlyph from "@/components/ZodiacGlyph";
import { MasterAvatarInline } from "@/components/MasterAvatar";

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
  onClearSpread?: () => void;
  cooldownReady?: boolean;
  cooldownAllowed?: boolean;
  nextAvailableAt?: string | null;
  onUnlock?: () => void;
  unlockLabel?: string;
  readingHint?: string;
  onOpenGallery?: () => void;
  spreadId?: SpreadId;
  /** When true, «Продолжить» opens chat instead of starting a new reading ritual. */
  readingComplete?: boolean;
}

function zodiacFromBirthDate(birthDate?: string) {
  if (!birthDate?.trim()) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  return getZodiacFromDate(birthDate);
}

function formatDisplayName(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
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
  onClearSpread,
  cooldownReady = true,
  cooldownAllowed = true,
  nextAvailableAt,
  onUnlock,
  unlockLabel = "199 ₽",
  readingHint,
  onOpenGallery,
  spreadId: spreadIdProp,
  readingComplete = false,
}: ReadingRecapProps) {
  const spreadId = normalizeSpreadId(spreadIdProp ?? DEFAULT_SPREAD_ID);
  const spreadDef = getSpread(spreadId);
  const countdown = useTripletCountdown(nextAvailableAt);
  const newReadingAllowed =
    cooldownReady && cooldownAllowed && !countdown.isOnCooldown;
  const cardNames = tarotCards.map((c) => c.name);
  const hasSpread =
    tarotCards.length >= 1 && hasCompleteSpread(cardNames, spreadId, "new");

  const lastMaster = lastMasterId && hasSpread
    ? findShowcaseMaster(lastMasterId, masters) ?? getCharacterById(lastMasterId)
    : null;

  const showContinue = hasSpread && Boolean(lastMaster && onContinue);

  const galleryMaster = lastMaster;

  const spreadDisplay = useMemo(() => {
    if (!hasSpread) return null;
    return reconcileSpreadDeck(deckSystem ?? DEFAULT_DECK_SYSTEM, tarotCards);
  }, [hasSpread, deckSystem, tarotCards]);

  const system = spreadDisplay?.system ?? deckSystem ?? (galleryMaster ? resolveMasterDeckSystem(galleryMaster.id) : undefined);
  const spreadCards = spreadDisplay?.cards ?? tarotCards;
  const positions = resolveSpreadPositions(spreadId);

  const zodiacSign = zodiacFromBirthDate(birthDate);

  const teaserText = useMemo(() => {
    if (hasSpread) {
      return buildSpreadTeaser({
        userName,
        cards: spreadCards,
        positions: positions.map((p) => p.label),
        masterName: lastMaster?.name,
      });
    }
    if (!newReadingAllowed && countdown.hintRu) {
      return `${userName}, суточный лимит активен — ${countdown.hintRu.toLowerCase()}. Выберите мастера ниже, затем выпустите новый расклад.`;
    }
    return (
      teaser ??
      `${userName}, выберите мастера и выпустите расклад из ${spreadDef.cardCount} карт.`
    );
  }, [hasSpread, spreadCards, userName, positions, lastMaster, teaser, newReadingAllowed, countdown.hintRu, spreadDef.cardCount]);

  const handleNewReading = () => {
    if (!newReadingAllowed) return;
    onNewReading();
  };

  return (
    <motion.div
      id="мой-расклад"
      className={`glass-panel reading-recap mx-auto mb-5 max-w-xl ${
        hasSpread ? "reading-recap--spread p-6" : "reading-recap--idle p-4 sm:p-5"
      }`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className={`reading-recap__header flex flex-wrap items-start justify-between gap-3 ${hasSpread ? "mb-6" : ""}`}>
        <div className="min-w-0">
          <p className="font-display text-base font-semibold text-white sm:text-lg">
            {hasSpread ? "Ваш расклад" : userName}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs sm:text-sm">
            {hasSpread ? (
              <span className="reading-recap__name font-semibold text-aura-gold">{formatDisplayName(userName)}</span>
            ) : (
              <span className="text-aura-champagne/70">Новый расклад из 3 карт</span>
            )}
            {zodiacSign ? (
              <>
                <span className="text-aura-champagne/35">·</span>
                <span className="inline-flex items-center gap-1 text-aura-champagne/55">
                  {zodiacSign.name}
                  <ZodiacGlyph signName={zodiacSign.name} className="h-3.5 w-3.5 opacity-80" />
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
          className={`btn-new-spread shrink-0 ${newReadingAllowed ? "btn-new-spread--active" : "btn-new-spread--cooldown reading-recap__cooldown"}`}
        >
          {newReadingAllowed ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Clock className="h-3.5 w-3.5 opacity-70" aria-hidden />
          )}
          {newReadingAllowed ? "Новый расклад" : countdown.hms}
        </button>
      </div>

      {!hasSpread && !newReadingAllowed && countdown.hintRu ? (
        <p className="mt-2 text-xs tabular-nums text-aura-champagne/75">{countdown.hintRu}</p>
      ) : null}

      {!hasSpread && newReadingAllowed ? (
        <p className="mt-3 text-sm leading-relaxed text-aura-ivory/60">
          Нажмите «Новый расклад» или выберите наставника в списке ниже.
        </p>
      ) : null}

      {hasSpread ? (
        <div className="reading-recap__cards mb-6">
          <p className="reading-recap__cards-hint mb-4 text-center text-[11px] tracking-wide text-aura-champagne/50">
            Нажмите на карту для подробностей
          </p>
          <DeckCardsRow
            cards={spreadCards}
            system={system}
            masterId={galleryMaster?.id}
            size="lg"
            enableDetail
            aligned
          />
          {onOpenGallery && galleryMaster && system ? (
            <div className="reading-recap__gallery mt-6 text-center">
              <button
                type="button"
                onClick={onOpenGallery}
                className="btn-luxe btn-luxe--sm btn-luxe--gold"
              >
                <Layers className="h-3.5 w-3.5" />
                Вся колода {galleryMaster.name}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasSpread ? (
        <>
          <p className="reading-recap__teaser mb-4 text-sm leading-[1.6] text-gray-300">{teaserText}</p>
          {readingHint ? (
            <p className="reading-recap__hint mb-4 text-xs text-aura-gold/90">{readingHint}</p>
          ) : null}
        </>
      ) : null}

      {hasSpread ? (
        <div className="reading-recap__actions">
          {showContinue ? (
            <button
              type="button"
              onClick={onContinue}
              className="reading-recap__btn-primary btn-luxe btn-luxe--md"
            >
              <MasterAvatarInline masterId={lastMaster!.id} masterName={lastMaster!.name} size="xs" />
              {readingComplete
                ? `Продолжить в чате с ${lastMaster!.name}`
                : `Продолжить с ${lastMaster!.name}`}
            </button>
          ) : null}
          {onUnlock ? (
            <button
              type="button"
              onClick={onUnlock}
              className="reading-recap__btn-primary btn-luxe btn-luxe--md"
            >
              <Sparkles className="h-4 w-4" />
              Открыть полный разбор — {unlockLabel}
            </button>
          ) : null}
          {onClearSpread ? (
            <button
              type="button"
              onClick={onClearSpread}
              className="reading-recap__btn-ghost btn-luxe btn-luxe--md"
            >
              Убрать с главной
            </button>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  );
}
