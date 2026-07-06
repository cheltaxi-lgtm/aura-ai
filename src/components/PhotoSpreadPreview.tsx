"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowLeftRight, Pencil, Plus, RotateCcw, X } from "lucide-react";
import type { DeckSystem } from "@/lib/decks/types";
import type { RedrawSpread, RedrawSpreadCard } from "@/lib/photo-spread-redraw";
import { listDeckCards, type DeckCardInput } from "@/lib/deck-card-utils";
import DeckCard from "@/components/DeckCard";
import {
  PHOTO_MIN_CARD_COUNT,
  inferSpreadPositions,
  mapDetectedToRedrawSpread,
} from "@/lib/photo-spread-redraw";
import {
  confidenceLabel,
  MAX_PHOTO_CARDS,
  type PhotoRecognitionConfidence,
} from "@/lib/photo-reading-constants";

const MAX_PHOTO_CARDS_LOCAL = MAX_PHOTO_CARDS;

interface PhotoSpreadPreviewProps {
  spread: RedrawSpread;
  masterId: string;
  onChange: (spread: RedrawSpread) => void;
  confidence?: PhotoRecognitionConfidence;
  manualMode?: boolean;
  recognitionFailed?: boolean;
  /** When parent renders status badges, hide duplicate confidence line. */
  hideStatusLine?: boolean;
}

function gridClass(count: number): string {
  if (count <= 1) return "photo-spread-preview__grid--1";
  if (count === 2) return "photo-spread-preview__grid--2";
  if (count === 3) return "photo-spread-preview__grid--3";
  if (count <= 6) return "photo-spread-preview__grid--4";
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

function statusTone(
  confidence: PhotoRecognitionConfidence,
  placeholderCount: number
): "high" | "low" | "medium" | "warn" {
  if (placeholderCount > 0) return "warn";
  if (confidence === "high") return "high";
  if (confidence === "low") return "low";
  return "medium";
}

export default function PhotoSpreadPreview({
  spread,
  masterId,
  onChange,
  confidence = "unknown",
  manualMode = false,
  recognitionFailed = false,
  hideStatusLine = false,
}: PhotoSpreadPreviewProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const deckOptions = useMemo(() => listDeckCards(spread.system), [spread.system]);
  const positions = useMemo(
    () => inferSpreadPositions(spread.cards.length, spread.system, spread.spreadType),
    [spread.cards.length, spread.system, spread.spreadType]
  );

  const updateCards = (cards: RedrawSpreadCard[]) => {
    onChange({ ...spread, cards });
  };

  const remapFromDetected = (detected: string[], confidences: PhotoRecognitionConfidence[]) => {
    return mapDetectedToRedrawSpread({
      detectedCards: detected,
      system: spread.system,
      deckType: spread.deckType,
      spreadType: spread.spreadType ?? `${detected.length} символов`,
      positions: inferSpreadPositions(detected.length, spread.system, spread.spreadType),
      confidences,
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

  /** Two-tap reorder for long spreads: pick a card, then pick its new slot — faster than moving step by step. */
  const handleSwapTap = (index: number) => {
    if (swapIndex === null) {
      setSwapIndex(index);
      return;
    }
    if (swapIndex === index) {
      setSwapIndex(null);
      return;
    }
    const cards = [...spread.cards];
    [cards[swapIndex], cards[index]] = [cards[index], cards[swapIndex]];
    updateCards(
      cards.map((c, i) => ({
        ...c,
        order: i,
        position: inferSpreadPositions(cards.length, spread.system, spread.spreadType)[i] ?? c.position,
      }))
    );
    setSwapIndex(null);
  };

  const replaceCard = (index: number, name: string) => {
    const detected = spread.cards.map((c, i) => {
      if (i !== index) return c.reversed ? `${c.name} (перев.)` : c.name;
      return spread.cards[index].reversed ? `${name} (перев.)` : name;
    });
    const confidences = spread.cards.map((c, i) => (i === index ? "high" : c.confidence ?? "unknown"));
    updateCards(remapFromDetected(detected, confidences));
    setEditingIndex(null);
  };

  const addCard = (name: string) => {
    if (spread.cards.length >= MAX_PHOTO_CARDS_LOCAL) return;
    const detected = [
      ...spread.cards.map((c) => (c.reversed ? `${c.name} (перев.)` : c.name)),
      name,
    ];
    const confidences = [...spread.cards.map((c) => c.confidence ?? "unknown"), "high" as const];
    updateCards(remapFromDetected(detected, confidences));
    setAddingCard(false);
  };

  const removeCard = (index: number) => {
    if (spread.cards.length <= PHOTO_MIN_CARD_COUNT) return;
    const detected = spread.cards
      .filter((_, i) => i !== index)
      .map((c) => (c.reversed ? `${c.name} (перев.)` : c.name));
    const confidences = spread.cards
      .filter((_, i) => i !== index)
      .map((c) => c.confidence ?? "unknown");
    updateCards(remapFromDetected(detected, confidences));
    setEditingIndex(null);
    setSwapIndex(null);
  };

  const cardCount = spread.cards.length;
  const countLabel =
    cardCount === 1 ? "1 символ" : cardCount < 5 ? `${cardCount} символа` : `${cardCount} символов`;
  const placeholderCount = spread.cards.filter((c) => c.placeholder).length;

  const title = recognitionFailed
    ? "Соберите расклад вручную"
    : manualMode
      ? "Выберите символы колоды"
      : `Проверьте расклад · ${countLabel}`;

  const subtitle = recognitionFailed
    ? "Выберите карты или руны — мастер расшифрует по вашему выбору."
    : manualMode
      ? "Добавьте символы из колоды Zovus перед расшифровкой."
      : "Замените, переверните или добавьте символ, если AI ошибся.";

  const statusText =
    placeholderCount > 0
      ? `${placeholderCount} ${placeholderCount === 1 ? "карта требует" : "карты требуют"} проверки`
      : confidenceLabel(confidence);

  return (
    <div className="photo-flow-preview-shell">
      <div className="photo-spread-preview">
        <h3 className="photo-spread-preview__header-title">{title}</h3>
        <p className="photo-spread-preview__header-sub">{subtitle}</p>

        {!hideStatusLine && confidence !== "unknown" && (
          <p className="mt-3 text-center">
            <span className={`photo-flow-badge photo-flow-badge--${statusTone(confidence, placeholderCount)}`}>
              {statusText}
            </span>
          </p>
        )}

        {swapIndex !== null && (
          <p className="mt-3 text-center text-xs text-aura-gold/80">
            Выбрана «{spread.cards[swapIndex]?.name}» — нажмите на другую карту, чтобы поменять местами.{" "}
            <button
              type="button"
              onClick={() => setSwapIndex(null)}
              className="underline underline-offset-2 hover:text-aura-champagne"
            >
              Отмена
            </button>
          </p>
        )}

        <div className={`photo-spread-preview__grid mt-4 ${gridClass(cardCount)}`}>
          {spread.cards.map((card, index) => (
            <div key={`${card.order}-${card.name}-${index}`} className="photo-spread-preview__item">
              <p className="lux-label mb-2 text-center text-[10px]">{card.position}</p>
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
                <p className="text-center text-[10px] text-white/40">На фото: {card.originalName}</p>
              )}
              {card.reversed && (
                <p className="text-center text-[10px] uppercase tracking-wider text-aura-gold/65">
                  Перевёрнутая
                </p>
              )}
              {!card.placeholder && (card.confidence === "low" || card.confidence === "medium") && (
                <p
                  className={`text-center text-[10px] uppercase tracking-wider ${
                    card.confidence === "low" ? "text-orange-300/80" : "text-amber-200/70"
                  }`}
                >
                  {card.confidence === "low" ? "Низкая уверенность" : "Проверьте карту"}
                </p>
              )}

              <div className="photo-spread-preview__tools">
                <button
                  type="button"
                  onClick={() => setEditingIndex(editingIndex === index ? null : index)}
                  className="photo-spread-preview__tool photo-spread-preview__tool--labeled"
                  title="Заменить символ"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Заменить</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleReversed(index)}
                  className="photo-spread-preview__tool photo-spread-preview__tool--labeled"
                  title="Перевернуть"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Перевернуть</span>
                </button>
                {spread.cards.length > 3 && (
                  <button
                    type="button"
                    onClick={() => handleSwapTap(index)}
                    className={`photo-spread-preview__tool photo-spread-preview__tool--labeled${
                      swapIndex === index ? " photo-spread-preview__tool--active" : ""
                    }`}
                    title="Переместить"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    <span>{swapIndex === index ? "Куда?" : "Переместить"}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => moveCard(index, -1)}
                  disabled={index === 0}
                  className="photo-spread-preview__tool"
                  title="Левее"
                  aria-label="Сдвинуть левее"
                >
                  <ArrowUp className="h-3.5 w-3.5 -rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={() => moveCard(index, 1)}
                  disabled={index === spread.cards.length - 1}
                  className="photo-spread-preview__tool"
                  title="Правее"
                  aria-label="Сдвинуть правее"
                >
                  <ArrowDown className="h-3.5 w-3.5 -rotate-90" />
                </button>
                {spread.cards.length > PHOTO_MIN_CARD_COUNT && (
                  <button
                    type="button"
                    onClick={() => removeCard(index)}
                    className="photo-spread-preview__tool photo-spread-preview__tool--danger photo-spread-preview__tool--labeled"
                    title="Убрать"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Убрать</span>
                  </button>
                )}
              </div>

              {editingIndex === index && (
                <div className="photo-spread-preview__picker mt-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-white/38">
                    Выберите из колоды
                  </p>
                  <div className="photo-spread-preview__picker-list">
                    {deckOptions.map((opt) => (
                      <button
                        key={opt.name}
                        type="button"
                        onClick={() => replaceCard(index, opt.name)}
                        className="photo-spread-preview__picker-option"
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

        {spread.cards.length < MAX_PHOTO_CARDS_LOCAL && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setAddingCard(true);
                setEditingIndex(null);
              }}
              className="photo-spread-preview__add"
            >
              <Plus className="h-4 w-4" />
              Добавить символ
            </button>
          </div>
        )}

        {addingCard && (
          <div className="photo-spread-preview__picker mt-4">
            <p className="mb-2 text-center text-[10px] uppercase tracking-wider text-white/38">
              Новая позиция
            </p>
            <div className="photo-spread-preview__picker-list">
              {deckOptions.map((opt) => (
                <button
                  key={opt.name}
                  type="button"
                  onClick={() => addCard(opt.name)}
                  className="photo-spread-preview__picker-option"
                >
                  {opt.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAddingCard(false)}
              className="mt-2 w-full text-center text-xs text-white/42 hover:text-white/70"
            >
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export type { RedrawSpread, RedrawSpreadCard, DeckSystem };
