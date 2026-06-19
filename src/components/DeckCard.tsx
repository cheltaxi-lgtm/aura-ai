"use client";

import Image from "next/image";
import type { DeckSystem } from "@/lib/decks/types";
import { deckBackPath, resolveDeckCard, resolveDeckSystem, DECK_ACCENT_CLASS } from "@/lib/deck-card-utils";
import {
  symbolCornerLabel,
  symbolKindLabel,
} from "@/lib/symbol-visuals";
import { resolveSpreadSymbol } from "@/lib/symbol-visuals";

export interface DeckCardProps {
  card: { id?: number; name: string; meaning?: string };
  system?: DeckSystem;
  masterId?: string;
  position?: string;
  showMeaning?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  faceDown?: boolean;
  /** Opens detail modal — gallery & daily spread */
  onClick?: () => void;
  interactive?: boolean;
}

const SIZE_CLASS = {
  sm: "lux-deck-card--sm",
  md: "lux-deck-card--md",
  lg: "lux-deck-card--lg",
} as const;

export default function DeckCard({
  card,
  system: systemProp,
  masterId,
  position,
  showMeaning = true,
  size = "md",
  className = "",
  faceDown = false,
  onClick,
  interactive = false,
}: DeckCardProps) {
  const system = resolveDeckSystem(systemProp, masterId);
  const resolved = resolveDeckCard(system, card);
  const spreadSymbol = resolveSpreadSymbol(system, card);
  const accent = DECK_ACCENT_CLASS[system];
  const sizeClass = SIZE_CLASS[size];
  const meaningWidth = size === "lg" ? "max-w-[180px]" : size === "sm" ? "max-w-[120px]" : "max-w-[156px]";

  const imageSrc = faceDown ? deckBackPath(system) : resolved.imagePath;
  const corner = faceDown ? "✦" : symbolCornerLabel(system, spreadSymbol);
  const kindLabel = faceDown ? "" : symbolKindLabel(system, spreadSymbol);

  const isClickable = Boolean(onClick) || interactive;
  const meaning = resolved.shortMeaning || spreadSymbol.meaning;

  const cardInner = (
    <>
      {position && <p className="lux-label mb-1">{position}</p>}

      <div
        className={`lux-deck-card lux-tarot-card lux-tarot-card--photo ${accent} ${sizeClass} ${
          isClickable ? "lux-deck-card--interactive cursor-pointer" : ""
        }`}
      >
        <div className="lux-tarot-card__frame" aria-hidden />
        <div className="lux-tarot-card__inner lux-tarot-card__inner--photo">
          <div className="lux-tarot-card__header">
            <span className="font-display text-[11px] tracking-widest text-aura-champagne">
              {corner}
            </span>
            {kindLabel && (
              <span className="font-display text-[9px] uppercase tracking-[0.2em] text-aura-champagne/60">
                {kindLabel}
              </span>
            )}
          </div>

          <div className="lux-tarot-card__image-wrap">
            <Image
              src={imageSrc}
              alt={faceDown ? "Рубашка" : resolved.name}
              fill
              sizes={size === "lg" ? "180px" : size === "sm" ? "120px" : "156px"}
              className="lux-tarot-card__image object-cover"
              unoptimized
            />
            <div className="lux-tarot-card__image-vignette" aria-hidden />
          </div>

          {!faceDown && (
            <p className="font-display text-center text-xs font-semibold leading-tight text-[#EDE6DA]">
              {resolved.name}
            </p>
          )}
        </div>
        <div className="lux-tarot-card__sheen" aria-hidden />
      </div>

      {showMeaning && !faceDown && meaning && (
        <p
          className={`${meaningWidth} mt-2 text-center text-[10px] leading-relaxed text-aura-ivory/50`}
        >
          {meaning}
        </p>
      )}
    </>
  );

  if (isClickable && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`lux-tarot-wrap group text-left ${className}`}
        aria-label={`Открыть ${resolved.name}`}
      >
        {cardInner}
      </button>
    );
  }

  return <div className={`lux-tarot-wrap group ${className}`}>{cardInner}</div>;
}
