"use client";

import Image from "next/image";
import type { DeckSystem } from "@/lib/decks/types";
import { deckBackPath, resolveDeckCard, resolveDeckSystem, DECK_ACCENT_CLASS } from "@/lib/deck-card-utils";
import { getDeckImagePath } from "@/data/decks";
import { parseCardOrientation } from "@/lib/card-orientation";
import {
  symbolCornerLabel,
  symbolKindLabel,
} from "@/lib/symbol-visuals";

export interface DeckCardProps {
  card: {
    id?: number;
    name: string;
    meaning?: string;
    reversed?: boolean;
    imagePath?: string;
    placeholder?: boolean;
    originalName?: string;
  };
  system?: DeckSystem;
  masterId?: string;
  position?: string;
  showMeaning?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  faceDown?: boolean;
  /** Hide name caption inside card (used by aligned spread row) */
  hideCaption?: boolean;
  /** Upright image shown rotated 180° (reversed spread) */
  reversed?: boolean;
  /** Pre-resolved deck face path (photo redraw) */
  imagePath?: string;
  /** Symbolic face from photo when Zovus art is unavailable */
  detectedOnly?: boolean;
  /** Label read from photo (shown on detected face) */
  originalName?: string;
  /** Opens detail modal — gallery & daily spread */
  onClick?: () => void;
  interactive?: boolean;
}

const DECK_IMAGE_SIZES = {
  sm: "(max-width: 768px) 33vw, 120px",
  md: "(max-width: 768px) 33vw, 150px",
  lg: "(max-width: 768px) 33vw, 180px",
} as const;

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
  hideCaption = false,
  reversed = false,
  imagePath: imagePathProp,
  detectedOnly = false,
  originalName,
  onClick,
  interactive = false,
}: DeckCardProps) {
  const system = resolveDeckSystem(systemProp, masterId);
  const resolved = resolveDeckCard(system, card);
  const effectiveSystem = resolved.system;
  const spreadSymbol = resolved.symbol;
  const accent = DECK_ACCENT_CLASS[effectiveSystem];
  const sizeClass = SIZE_CLASS[size];
  const meaningWidth = size === "lg" ? "max-w-[180px]" : size === "sm" ? "max-w-[120px]" : "max-w-[156px]";
  const isReversed = reversed || resolved.reversed;
  const baseCardName = parseCardOrientation(card.name).name;
  const deckFallback = getDeckImagePath(effectiveSystem, baseCardName);
  const backPath = deckBackPath(effectiveSystem);

  const pickArtPath = (...candidates: (string | undefined)[]) => {
    for (const src of candidates) {
      const trimmed = src?.trim();
      if (trimmed && trimmed !== backPath) return trimmed;
    }
    return deckFallback || "";
  };

  const hasExplicitArt = Boolean(
    pickArtPath(imagePathProp, card.imagePath, resolved.imagePath, deckFallback)
  );
  const imageSrc = faceDown
    ? backPath
    : pickArtPath(imagePathProp, card.imagePath, resolved.imagePath, deckFallback);
  const isSvgFace = Boolean(imageSrc && imageSrc.endsWith(".svg"));
  const imageFitClass =
    effectiveSystem === "lenormand" || isSvgFace
      ? "lux-tarot-card__image object-contain"
      : "lux-tarot-card__image object-cover";
  const faceLabel = originalName?.trim() || resolved.originalName?.trim() || spreadSymbol.name;
  const showDetectedFace =
    (detectedOnly || resolved.detectedOnly) && !faceDown && !hasExplicitArt;
  const showNumerologyFace = effectiveSystem === "numerology" && !faceDown && !showDetectedFace;
  const showLenormandFace =
    effectiveSystem === "lenormand" && !faceDown && !showDetectedFace && !imageSrc;
  const corner = faceDown ? "✦" : symbolCornerLabel(effectiveSystem, spreadSymbol);
  const kindLabel = faceDown ? "" : symbolKindLabel(effectiveSystem, spreadSymbol);

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

          <div
            className={`lux-tarot-card__image-wrap${isReversed ? " lux-tarot-card__image-wrap--reversed" : ""}`}
          >
            {showDetectedFace ? (
              <div className="lux-detected-card-face" aria-label={faceLabel}>
                <span className="lux-detected-card-face__glyph" aria-hidden>
                  ✦
                </span>
                <span className="lux-detected-card-face__name">{faceLabel}</span>
              </div>
            ) : showNumerologyFace ? (
              <div className="lux-detected-card-face lux-detected-card-face--numerology" aria-label={faceLabel}>
                <span className="lux-detected-card-face__glyph font-display text-4xl text-aura-champagne" aria-hidden>
                  {spreadSymbol.name}
                </span>
              </div>
            ) : showLenormandFace ? (
              <div className="lux-detected-card-face lux-detected-card-face--lenormand" aria-label={faceLabel}>
                <span className="lux-detected-card-face__glyph font-display text-2xl text-aura-champagne" aria-hidden>
                  ✦
                </span>
                <span className="lux-detected-card-face__name">{faceLabel}</span>
              </div>
            ) : imageSrc ? (
              <>
                {isSvgFace ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageSrc}
                    alt={faceDown ? "Рубашка" : resolved.name}
                    className={`${imageFitClass} absolute inset-0 h-full w-full`}
                  />
                ) : (
                  <Image
                    src={imageSrc}
                    alt={faceDown ? "Рубашка" : resolved.name}
                    fill
                    unoptimized={imageSrc.startsWith("/decks/")}
                    sizes={DECK_IMAGE_SIZES[size]}
                    className={imageFitClass}
                  />
                )}
                <div className="lux-tarot-card__image-vignette" aria-hidden />
              </>
            ) : (
              <div className="lux-detected-card-face" aria-label={faceLabel}>
                <span className="lux-detected-card-face__glyph" aria-hidden>
                  ✦
                </span>
                <span className="lux-detected-card-face__name">{faceLabel}</span>
              </div>
            )}
          </div>

          {!faceDown && !hideCaption && (
            <p className="font-display text-center text-xs font-semibold leading-tight text-[#EDE6DA]">
              {resolved.name}
            </p>
          )}
        </div>
        <div className="lux-tarot-card__sheen" aria-hidden />
      </div>

      {showMeaning && !faceDown && !hideCaption && meaning && (
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
