"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DeckSystem } from "@/lib/decks/types";
import { drawSpread, getDeckPositionsForUi } from "@/lib/decks";
import { DAILY_TRIPLET_POSITIONS } from "@/lib/daily-triplet-positions";
import {
  buildSeededTableDeck,
  resolvePickedSpread,
  resolveTableSize,
} from "@/lib/spread-draw";
import { buildSpreadTeaser } from "@/lib/spread-teaser";
import type { SpreadSymbol } from "@/lib/decks/types";
import { useSceneImage } from "@/hooks/useSceneImage";
import SceneImage from "@/components/SceneImage";
import DeckCard from "@/components/DeckCard";
import MagicalSpreadTable from "@/components/MagicalSpreadTable";
import ShareButton from "@/components/share/ShareButton";
import { tripletToSharePayload } from "@/lib/share/payload-builders";
import { GUEST_TRIPLET_MASTER_ID } from "@/lib/landing-offer";

interface TarotTripletProps {
  userName: string;
  zodiac?: string;
  system: DeckSystem;
  masterName?: string;
  masterId?: string;
  initialCards?: SpreadSymbol[];
  /** Daily 3-cards of the day — not the guest-intro situation triplet. */
  variant?: "daily" | "default";
  onComplete: (cards: SpreadSymbol[], teaser: string) => void | Promise<void>;
  onAllRevealed?: (cards: SpreadSymbol[], teaser: string) => void;
  onCancel?: () => void;
}

function newDailyTableSeed(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `daily-${Date.now()}`;
}

export default function TarotTriplet({
  userName,
  zodiac,
  system,
  masterName,
  masterId,
  initialCards,
  variant = "default",
  onComplete,
  onAllRevealed,
  onCancel,
}: TarotTripletProps) {
  const isDaily = variant === "daily";
  const positions = useMemo(
    () => (isDaily ? [...DAILY_TRIPLET_POSITIONS] : getDeckPositionsForUi(system)),
    [isDaily, system]
  );
  const pickCount = positions.length;
  const tableSize = useMemo(() => resolveTableSize(system), [system]);
  const [tableSeed] = useState(newDailyTableSeed);
  const tableDeck = useMemo(
    () =>
      isDaily ? buildSeededTableDeck({ system, seed: tableSeed, tableSize }) : [],
    [isDaily, system, tableSeed, tableSize]
  );

  const [pickedIndices, setPickedIndices] = useState<number[]>([]);
  const [deck, setDeck] = useState<SpreadSymbol[]>(() =>
    initialCards?.length === pickCount
      ? initialCards
      : isDaily
        ? []
        : drawSpread(system, pickCount)
  );
  const [revealed, setRevealed] = useState<boolean[]>(() =>
    initialCards?.length === pickCount
      ? Array.from({ length: pickCount }, () => true)
      : Array.from({ length: pickCount }, () => false)
  );
  const [submitting, setSubmitting] = useState(false);

  const awaitingDailyPick = isDaily && deck.length < pickCount;
  const revealedCount = revealed.filter(Boolean).length;
  const allRevealed = deck.length >= pickCount && revealedCount === pickCount;

  const handleTablePick = useCallback(
    (index: number) => {
      if (!awaitingDailyPick) return;
      setPickedIndices((prev) => {
        if (prev.includes(index) || prev.length >= pickCount) return prev;
        const next = [...prev, index];
        if (next.length >= pickCount) {
          const cards = resolvePickedSpread(tableDeck, next);
          if (cards.length >= pickCount) {
            setDeck(cards);
            setRevealed(Array.from({ length: pickCount }, () => false));
          }
        }
        return next;
      });
    },
    [awaitingDailyPick, pickCount, tableDeck]
  );

  const cardNames = useMemo(
    () =>
      allRevealed
        ? (deck.slice(0, pickCount).map((c) => c.name) as [string, string, string])
        : undefined,
    [allRevealed, deck, pickCount]
  );

  const { imageUrl: atmosphereUrl, loading: atmosphereLoading, failed: atmosphereFailed } =
    useSceneImage(
      allRevealed ? { scene: "tarot_atmosphere", cards: cardNames, zodiac } : null,
      allRevealed
    );

  const handleFlip = (index: number) => {
    if (revealed[index]) return;
    setRevealed((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  };

  const handleFinish = async () => {
    if (submitting || deck.length < pickCount) return;
    const teaser = buildSpreadTeaser({
      userName,
      cards: deck,
      positions: [...positions],
      masterName,
    });
    setSubmitting(true);
    try {
      await onComplete(deck, teaser);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!allRevealed || !onAllRevealed) return;
    const teaser = buildSpreadTeaser({
      userName,
      cards: deck,
      positions: [...positions],
      masterName,
    });
    onAllRevealed(deck, teaser);
  }, [allRevealed, deck, userName, positions, masterName, onAllRevealed]);

  const sharePayload = useMemo(() => {
    if (!allRevealed) return null;
    const teaser = buildSpreadTeaser({
      userName,
      cards: deck,
      positions: [...positions],
      masterName,
    });
    return tripletToSharePayload({
      userName,
      cards: deck,
      deckSystem: system,
      teaser,
      masterName,
    });
  }, [allRevealed, deck, userName, positions, masterName, system]);

  if (awaitingDailyPick) {
    return (
      <MagicalSpreadTable
        tableSize={tableSize}
        cardCount={pickCount}
        system={system}
        masterId={masterId || GUEST_TRIPLET_MASTER_ID}
        pickedIndices={pickedIndices}
        onPick={handleTablePick}
        title="Выберите три карты дня"
        pickHint={`Порядок касаний: ${DAILY_TRIPLET_POSITIONS.join(" · ")}`}
        personalNote="3 карты дня · бесплатно раз в сутки"
        underSiteHeader
        onBack={onCancel}
        backLabel="На главную"
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <motion.p
        className="mb-8 text-center font-light text-aura-ivory/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {masterName ? (
          <>
            {isDaily ? (
              <>
                {userName}, три карты дня от {masterName} — коснитесь каждой:{" "}
                {positions.join(", ")}
              </>
            ) : (
              <>
                {userName}, колода {masterName} — коснитесь три раза, символы откроют{" "}
                {positions.join(", ")}
              </>
            )}
          </>
        ) : isDaily ? (
          <>
            {userName}, коснитесь трёх карт дня: {positions.join(", ")}
          </>
        ) : (
          <>
            {userName}, коснитесь колоды три раза — символы откроют {positions.join(", ")}
          </>
        )}
      </motion.p>

      {allRevealed && atmosphereLoading && !atmosphereFailed && (
        <p className="mb-6 text-center text-xs text-aura-ivory/40">Рисуем энергию расклада…</p>
      )}

      {atmosphereUrl && (
        <SceneImage
          imageUrl={atmosphereUrl}
          loading={false}
          label="Энергия расклада"
          className="mb-8"
        />
      )}

      <div className="mb-8 flex flex-wrap items-end justify-center gap-5 sm:gap-8">
        {deck.map((card, i) => (
          <div key={`${card.id}-${card.name}`} className="flex flex-col items-center gap-2">
            <p className="lux-label mb-1">{positions[i]}</p>
            <button
              type="button"
              onClick={() => handleFlip(i)}
              disabled={revealed[i]}
              className="lux-tarot-flip perspective-[900px] focus:outline-none disabled:cursor-default"
              style={{ width: 148, height: 236 }}
              aria-label={revealed[i] ? card.name : `Открыть ${positions[i]}`}
            >
              <motion.div
                className="relative h-full w-full"
                animate={{ rotateY: revealed[i] ? 180 : 0 }}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformStyle: "preserve-3d" }}
              >
                <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
                  <DeckCard card={card} system={system} faceDown showMeaning={false} size="md" className="h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none" />
                </div>
                <div
                  className="absolute inset-0"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <DeckCard card={card} system={system} showMeaning={false} size="md" className="h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none" />
                </div>
              </motion.div>
            </button>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {allRevealed && (
          <motion.div
            className="glass-panel mx-auto max-w-2xl p-6 text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="text-sm leading-relaxed text-aura-ivory/75">
              {isDaily ? (
                <>
                  Сегодня:{" "}
                  <strong className="text-aura-champagne">{deck.map((c) => c.name).join(" · ")}</strong>
                  . Короткий ориентир на день — главное, ресурс и где лучше не спешить.
                </>
              ) : (
                <>
                  Выпало:{" "}
                  <strong className="text-aura-champagne">{deck.map((c) => c.name).join(" · ")}</strong>.
                  Первый символ уже шепчет о вашем прошлом — полный разбор откроет наставник.
                </>
              )}
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => void handleFinish()}
                disabled={submitting}
                className="btn-primary px-8 py-3 text-sm disabled:cursor-wait disabled:opacity-70"
              >
                {submitting
                  ? "Настраиваем поле…"
                  : isDaily
                    ? "Открыть расшифровку дня"
                    : "Узнать смысл у мастера"}
              </button>
              {sharePayload && (
                <ShareButton payload={sharePayload} variant="pill" label="Поделиться раскладом" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!allRevealed && (
        <p className="text-center text-sm font-light text-aura-champagne/80">
          Открыто {revealedCount} из {pickCount}
        </p>
      )}
    </div>
  );
}
