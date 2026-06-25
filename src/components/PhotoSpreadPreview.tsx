"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, RotateCcw, X } from "lucide-react";
import type { DeckSystem } from "@/lib/decks/types";
import type { RedrawSpread, RedrawSpreadCard } from "@/lib/photo-spread-redraw";
import { listDeckCards, type DeckCardInput } from "@/lib/deck-card-utils";
import DeckCard from "@/components/DeckCard";
import {
  PHOTO_MIN_CARD_COUNT,
  inferSpreadPositions,
  mapDetectedToRedrawSpread,
} from "@/lib/photo-spread-redraw";

const MAX_PHOTO_CARDS = 12;

interface PhotoSpreadPreviewProps {
  spread: RedrawSpread;
  masterId: string;
  onChange: (spread: RedrawSpread) => void;
}

function gridClass(count: number): string {
  if (count <= 1) return "photo-spread-preview__grid--1";
  if (count === 2) return "photo-spread-preview__grid--2";
  if (count === 3) return "photo-spread-preview__grid--3";
  return "photo-spread-preview__grid--5";
}

function toDeckInput(card: RedrawSpreadCard): DeckCardInput {
  return {
    name: card.reversed ? `${card.name} (перев.)` : card.name,
    meaning: card.shortMeaning,
    reversed: card.reversed,
    imagePath: card.imagePath,
    placeholder: card.placeholder,
    originalName: card.originalName,
  };
}

export default function PhotoSpreadPreview({
  spread,
  masterId,
  onChange,
}: PhotoSpreadPreviewProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [addingCard, setAddingCard] = useState(false);
  const deckOptions = useMemo(() => listDeckCards(spread.system), [spread.system]);
  const positions = useMemo(
    () => inferSpreadPositions(spread.cards.length, spread.system, spread.spreadType),
    [spread.cards.length, spread.system, spread.spreadType]
  );

  const updateCards = (cards: RedrawSpreadCard[]) => {
    onChange({ ...spread, cards });
  };

  const remapFromDetected = (detected: string[]) => {
    return mapDetectedToRedrawSpread({
      detectedCards: detected,
      system: spread.system,
      deckType: spread.deckType,
      spreadType: spread.spreadType ?? `${detected.length} символов`,
      positions: inferSpreadPositions(detected.length, spread.system, spread.spreadType),
    }).cards.map((c, i) => ({
      ...c,
      order: i,
      position: positions[i] ?? c.position,
    }));
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
        position: inferSpreadPositions(cards.length, spread.system, spread.spreadType)[i] ?? c.position,
      }))
    );
  };

  const replaceCard = (index: number, name: string) => {
    const detected = spread.cards.map((c, i) => {
      if (i !== index) return c.reversed ? `${c.name} (перев.)` : c.name;
      return spread.cards[index].reversed ? `${name} (перев.)` : name;
    });
    updateCards(remapFromDetected(detected));
    setEditingIndex(null);
  };

  const addCard = (name: string) => {
    if (spread.cards.length >= MAX_PHOTO_CARDS) return;
    const detected = [
      ...spread.cards.map((c) => (c.reversed ? `${c.name} (перев.)` : c.name)),
      name,
    ];
    updateCards(remapFromDetected(detected));
    setAddingCard(false);
  };

  const removeCard = (index: number) => {
    if (spread.cards.length <= PHOTO_MIN_CARD_COUNT) return;
    const detected = spread.cards
      .filter((_, i) => i !== index)
      .map((c) => (c.reversed ? `${c.name} (перев.)` : c.name));
    updateCards(remapFromDetected(detected));
    setEditingIndex(null);
  };

  const cardCount = spread.cards.length;
  const countLabel =
    cardCount === 1 ? "1 символ" : cardCount < 5 ? `${cardCount} символа` : `${cardCount} символов`;

  return (
    <div className="photo-spread-preview">
      <p className="mb-4 text-center font-display text-base text-aura-ivory sm:text-lg">
        Я перерисовал ваш расклад ({countLabel}) — всё верно?
      </p>

      <div className={`photo-spread-preview__grid ${gridClass(cardCount)}`}>
        {spread.cards.map((card, index) => (
          <div key={`${card.order}-${card.name}-${index}`} className="photo-spread-preview__item">
            <p className="lux-label mb-2 text-center">{card.position}</p>
            <div className="photo-spread-preview__card">
              <DeckCard
                card={toDeckInput(card)}
                system={spread.system}
                masterId={masterId}
                imagePath={card.imagePath}
                detectedOnly={card.placeholder}
                originalName={card.originalName}
                reversed={card.reversed}
                showMeaning={false}
                hideCaption
                size="md"
                className="mx-auto w-full"
              />
            </div>
            <p className="mt-2 text-center text-xs font-medium text-aura-champagne">{card.name}</p>
            {card.originalName !== card.name && (
              <p className="text-center text-[10px] text-aura-ivory/45">На фото: {card.originalName}</p>
            )}
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
              {spread.cards.length > PHOTO_MIN_CARD_COUNT && (
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
                  Выберите из колоды Zovus
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

      {spread.cards.length < MAX_PHOTO_CARDS && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setAddingCard(true);
              setEditingIndex(null);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-aura-gold/30 px-4 py-2 text-sm text-aura-champagne/80 transition-colors hover:border-aura-gold/50 hover:text-aura-gold"
          >
            <Plus className="h-4 w-4" />
            Добавить символ
          </button>
        </div>
      )}

      {addingCard && (
        <div className="photo-spread-preview__picker mt-4">
          <p className="mb-2 text-center text-[10px] uppercase tracking-wider text-aura-ivory/45">
            Выберите символ для новой позиции
          </p>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-aura-gold/15 bg-black/40 p-2">
            {deckOptions.map((opt) => (
              <button
                key={opt.name}
                type="button"
                onClick={() => addCard(opt.name)}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-aura-ivory/80 hover:bg-aura-gold/10 hover:text-aura-champagne"
              >
                {opt.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAddingCard(false)}
            className="mt-2 w-full text-center text-xs text-gray-500 hover:text-gray-300"
          >
            Отмена
          </button>
        </div>
      )}
    </div>
  );
}

export type { RedrawSpread, RedrawSpreadCard, DeckSystem };
