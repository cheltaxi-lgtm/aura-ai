"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { DeckSystem } from "@/lib/decks/types";
import DeckCard from "@/components/DeckCard";
import { getRitualCardReading } from "@/lib/ritual-card-readings";
import RuneCost from "@/components/RuneCost";

interface DrawnCard {
  name: string;
  position: string;
}

interface Props {
  characterKey: string;
  ritualId: string;
  cost: number;
  isUnlimited?: boolean;
  onComplete: (cards: DrawnCard[]) => void;
}

const CARD_CLASS =
  "h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none [&_.lux-tarot-wrap]:h-full";

export default function RitualSpread({
  characterKey,
  ritualId,
  cost,
  isUnlimited = false,
  onComplete,
}: Props) {
  void ritualId;
  const [cards, setCards] = useState<DrawnCard[]>([]);
  const [system, setSystem] = useState<DeckSystem>("runes");
  const [flipped, setFlipped] = useState<boolean[]>([false, false, false, false, false]);
  const [currentFlip, setCurrentFlip] = useState(0);
  const [reading, setReading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchDraw = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const res = await fetch(
          `/api/ritual/draw?characterKey=${encodeURIComponent(characterKey)}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("draw_failed");
        const data = await res.json();
        if (!cancelled) {
          setCards(data.cards ?? []);
          setSystem(data.system ?? "runes");
        }
      } catch {
        if (!cancelled) setCards([]);
      } finally {
        clearTimeout(timer);
        if (!cancelled) setLoading(false);
      }
    };

    void fetchDraw();
    return () => {
      cancelled = true;
    };
  }, [characterKey]);

  const flipNext = useCallback(() => {
    if (currentFlip >= cards.length) return;
    setFlipped((prev) => {
      const next = [...prev];
      next[currentFlip] = true;
      return next;
    });
    const card = cards[currentFlip];
    const text = getRitualCardReading(card.name, card.position, characterKey);
    setReading(text);

    if (currentFlip + 1 >= cards.length) {
      setTimeout(() => setAllDone(true), 1200);
    } else {
      setTimeout(() => {
        setCurrentFlip((i) => i + 1);
        setReading(null);
      }, 800);
    }
  }, [cards, characterKey, currentFlip]);

  useEffect(() => {
    if (!loading && cards.length === 5 && currentFlip === 0 && !flipped[0]) {
      const t = setTimeout(() => flipNext(), 600);
      return () => clearTimeout(t);
    }
  }, [loading, cards.length, currentFlip, flipped, flipNext]);

  useEffect(() => {
    if (currentFlip > 0 && currentFlip < cards.length && !flipped[currentFlip]) {
      const t = setTimeout(() => flipNext(), 800);
      return () => clearTimeout(t);
    }
  }, [currentFlip, cards.length, flipped, flipNext]);

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-white/50">
        Вытягиваю карты…
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-white/60">Не удалось вытянуть карты. Проверьте вход в аккаунт.</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void fetch(
              `/api/ritual/draw?characterKey=${encodeURIComponent(characterKey)}`
            )
              .then(async (res) => {
                if (!res.ok) throw new Error("draw_failed");
                const data = await res.json();
                setCards(data.cards ?? []);
                setSystem(data.system ?? "runes");
              })
              .catch(() => setCards([]))
              .finally(() => setLoading(false));
          }}
          className="btn-luxe btn-luxe--sm btn-luxe--ghost"
        >
          Повторить
        </button>
      </div>
    );
  }

  const layout = [
    { idx: 0, className: "col-start-1 row-start-1" },
    { idx: 1, className: "col-start-2 row-start-1" },
    { idx: 2, className: "col-start-3 row-start-1" },
    { idx: 3, className: "col-start-2 row-start-2" },
    { idx: 4, className: "col-start-3 row-start-2" },
  ];

  return (
    <div className="px-4 py-4">
      <div className="mx-auto grid max-w-sm grid-cols-3 grid-rows-2 gap-3">
        {layout.map(({ idx, className }) => {
          const card = cards[idx];
          if (!card) return null;
          return (
            <div key={idx} className={`flex flex-col items-center gap-1 ${className}`}>
              <p className="text-[9px] uppercase tracking-widest text-amber-400/70">
                {card.position}
              </p>
              <div
                className="perspective-[900px]"
                style={{ width: 96, height: 154 }}
              >
                <motion.div
                  className="relative h-full w-full"
                  animate={{ rotateY: flipped[idx] ? 180 : 0 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <div
                    className="absolute inset-0"
                    style={{ backfaceVisibility: "hidden" }}
                  >
                    <DeckCard
                      card={{ name: card.name, meaning: "" }}
                      system={system}
                      masterId={characterKey}
                      faceDown
                      showMeaning={false}
                      size="sm"
                      className={CARD_CLASS}
                    />
                  </div>
                  <div
                    className="absolute inset-0"
                    style={{
                      backfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                    }}
                  >
                    <DeckCard
                      card={{ name: card.name, meaning: "" }}
                      system={system}
                      masterId={characterKey}
                      showMeaning={false}
                      hideCaption
                      size="sm"
                      className={CARD_CLASS}
                    />
                  </div>
                </motion.div>
              </div>
              {flipped[idx] ? (
                <p className="max-w-[96px] text-center text-[10px] font-medium leading-tight text-aura-ivory">
                  {card.name}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {reading ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mx-auto mt-6 max-w-sm text-center text-sm leading-relaxed text-amber-100/80"
        >
          {reading}
        </motion.p>
      ) : null}

      {allDone ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 text-center"
        >
          <p className="mb-4 text-sm text-white/70">
            Путь открылся. Готов составить обряд.
          </p>
          <button
            type="button"
            onClick={() => onComplete(cards)}
            className="btn-luxe btn-luxe--md btn-luxe--gold"
          >
            Получить ритуал
            {!isUnlimited ? (
              <>
                {" "}
                — <RuneCost cost={cost} enabled className="inline" />
              </>
            ) : null}
          </button>
        </motion.div>
      ) : null}
    </div>
  );
}
