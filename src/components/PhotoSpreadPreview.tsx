"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, RotateCcw, X } from "lucide-react";
import type { DeckSystem } from "@/lib/decks/types";
import type { RedrawSpread, RedrawSpreadCard } from "@/lib/photo-spread-redraw";
import { listDeckCards } from "@/lib/deck-card-utils";
import { mapDetectedToRedrawSpread } from "@/lib/photo-spread-redraw";
import DeckCard from "@/components/DeckCard";

interface PhotoSpreadPreviewProps {
  spread: RedrawSpread;
  masterId: string;
  onChange: (spread: RedrawSpread) => void;
}

export default function PhotoSpreadPreview({
  spread,
  masterId,
  onChange,
}: PhotoSpreadPreviewProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const deckOptions = useMemo(() => listDeckCards(spread.system), [spread.system]);

  const updateCards = (cards: RedrawSpreadCard[]) => {
    onChange({ ...spread, cards });
  };

  const toggleReversed = (index: number) => {
    const cards = spread.cards.map((c, i) =>
      i === index ? { ...c, reversed: !c.reversed } : c
    );
    updateCards(cards);
  };

  const moveCard = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= spread.cards.length) return;
    const cards = [...spread.cards];
    [cards[index], cards[next]] = [cards[next], cards[index]];
    updateCards(
      cards.map((c, i) => ({
        ...c,
        order: i,
        position: spread.cards[i]?.position ?? c.position,
      }))
    );
  };

  const replaceCard = (index: number, name: string) => {
    const detected = spread.cards.map((c, i) => {
      if (i !== index) return c.reversed ? `${c.name} (перев.)` : c.name;
      return spread.cards[index].reversed ? `${name} (перев.)` : name;
    });
    const positions = spread.cards.map((c) => c.position);
    const remapped = mapDetectedToRedrawSpread({
      detectedCards: detected,
      system: spread.system,
      deckType: spread.deckType,
      spreadType: spread.spreadType,
      positions,
    });
    updateCards(remapped.cards);
    setEditingIndex(null);
  };

  const removeCard = (index: number) => {
    if (spread.cards.length <= 1) return;
    const cards = spread.cards.filter((_, i) => i !== index).map((c, i) => ({ ...c, order: i }));
    updateCards(cards);
    setEditingIndex(null);
  };

  return (
    <div className="photo-spread-preview">
      <p className="mb-4 text-center font-display text-base text-aura-ivory sm:text-lg">
        Я перерисовал ваш расклад вот так — всё верно?
      </p>

      <div
        className={`photo-spread-preview__grid photo-spread-preview__grid--${Math.min(spread.cards.length, 5)}`}
      >
        {spread.cards.map((card, index) => (
          <div key={`${card.name}-${index}`} className="photo-spread-preview__item">
            <p className="lux-label mb-2 text-center">{card.position}</p>
            <div className={card.reversed ? "photo-spread-preview__card photo-spread-preview__card--reversed" : "photo-spread-preview__card"}>
              <DeckCard
                card={{ name: card.name, meaning: card.shortMeaning }}
                system={spread.system}
                masterId={masterId}
                showMeaning={false}
                size="md"
                className="mx-auto w-full max-w-[148px]"
              />
              {card.placeholder && (
                <span className="photo-spread-preview__placeholder">Aura placeholder</span>
              )}
            </div>
            <p className="mt-2 text-center text-xs font-medium text-aura-champagne">{card.name}</p>
            {card.reversed && (
              <p className="text-center text-[10px] uppercase tracking-wider text-aura-gold/70">
                Перевёрнутая
              </p>
            )}

            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              <button
                type="button"
                onClick={() => setEditingIndex(editingIndex === index ? null : index)}
                className="photo-spread-preview__tool"
                title="Заменить символ"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => toggleReversed(index)}
                className="photo-spread-preview__tool"
                title="Перевёрнутая"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveCard(index, -1)}
                disabled={index === 0}
                className="photo-spread-preview__tool"
                title="Левее"
              >
                <ArrowUp className="h-3.5 w-3.5 -rotate-90" />
              </button>
              <button
                type="button"
                onClick={() => moveCard(index, 1)}
                disabled={index === spread.cards.length - 1}
                className="photo-spread-preview__tool"
                title="Правее"
              >
                <ArrowDown className="h-3.5 w-3.5 -rotate-90" />
              </button>
              {spread.cards.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCard(index)}
                  className="photo-spread-preview__tool photo-spread-preview__tool--danger"
                  title="Убрать"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {editingIndex === index && (
              <div className="photo-spread-preview__picker mt-3">
                <p className="mb-2 text-[10px] uppercase tracking-wider text-aura-ivory/45">
                  Выберите из колоды Aura
                </p>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-aura-gold/15 bg-black/40 p-2">
                  {deckOptions.map((opt) => (
                    <button
                      key={opt.name}
                      type="button"
                      onClick={() => replaceCard(index, opt.name)}
                      className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-aura-ivory/80 hover:bg-aura-gold/10 hover:text-aura-champagne"
                    >
                      {opt.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export type { RedrawSpread, RedrawSpreadCard, DeckSystem };
