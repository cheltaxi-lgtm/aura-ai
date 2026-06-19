"use client";

import Image from "next/image";
import { getDeckImagePath, DECK_BACK_PATHS } from "@/data/decks";
import type { DeckSystem } from "@/lib/decks/types";
import { resolveMasterDeckSystem, DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import {
  resolveSpreadSymbol,
  symbolCornerLabel,
  symbolKindLabel,
} from "@/lib/symbol-visuals";

export interface SymbolCardFaceProps {
  card: { id?: number; name: string; meaning?: string };
  system?: DeckSystem;
  masterId?: string;
  position?: string;
  showMeaning?: boolean;
  size?: "md" | "lg";
  className?: string;
  faceDown?: boolean;
}

function resolveSystem(system?: DeckSystem, masterId?: string): DeckSystem {
  if (system) return system;
  if (masterId) return resolveMasterDeckSystem(masterId);
  return DEFAULT_DECK_SYSTEM;
}

export default function SymbolCardFace({
  card,
  system: systemProp,
  masterId,
  position,
  showMeaning = true,
  size = "md",
  className = "",
  faceDown = false,
}: SymbolCardFaceProps) {
  const system = resolveSystem(systemProp, masterId);
  const resolved = resolveSpreadSymbol(system, card);
  const sizeClass = size === "lg" ? "lux-tarot-card--lg" : "lux-tarot-card--md";
  const meaningWidth = size === "lg" ? "max-w-[180px]" : "max-w-[156px]";
  const imageSrc = faceDown
    ? DECK_BACK_PATHS[system]
    : getDeckImagePath(system, resolved.name);
  const corner = faceDown ? "✦" : symbolCornerLabel(system, resolved);
  const kindLabel = faceDown ? "" : symbolKindLabel(system, resolved);

  return (
    <div className={`lux-tarot-wrap group ${className}`}>
      {position && <p className="lux-label">{position}</p>}

      <div className={`lux-tarot-card lux-tarot-card--photo ${sizeClass}`}>
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
              sizes={size === "lg" ? "180px" : "156px"}
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

      {showMeaning && !faceDown && resolved.meaning && (
        <p
          className={`${meaningWidth} mt-2 text-center text-[10px] leading-relaxed text-aura-ivory/50`}
        >
          {resolved.meaning}
        </p>
      )}
    </div>
  );
}
