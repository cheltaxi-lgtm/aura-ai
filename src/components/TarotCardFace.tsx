"use client";

import Image from "next/image";
import { getTarotImagePath, TAROT_CARD_BACK } from "@/data/tarotImages";
import {
  resolveTarotCard,
  tarotCardCornerLabel,
} from "@/lib/tarot-visuals";

interface TarotCardFaceProps {
  card: { id?: number; name: string; meaning?: string };
  position?: string;
  showMeaning?: boolean;
  size?: "md" | "lg";
  className?: string;
  /** Face-down card back (flip deck). */
  faceDown?: boolean;
}

export default function TarotCardFace({
  card,
  position,
  showMeaning = true,
  size = "md",
  className = "",
  faceDown = false,
}: TarotCardFaceProps) {
  const resolved = resolveTarotCard(card);
  const sizeClass = size === "lg" ? "lux-tarot-card--lg" : "lux-tarot-card--md";
  const meaningWidth = size === "lg" ? "max-w-[180px]" : "max-w-[156px]";
  const imageSrc = faceDown ? TAROT_CARD_BACK : getTarotImagePath(resolved.name);
  const corner = faceDown ? "✦" : tarotCardCornerLabel(resolved);
  const arcanaLabel = resolved.arcana === "major" ? "Major" : "Minor";

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
            <span className="font-display text-[9px] uppercase tracking-[0.2em] text-aura-champagne/60">
              {arcanaLabel}
            </span>
          </div>

          <div className="lux-tarot-card__image-wrap">
            <Image
              src={imageSrc}
              alt={faceDown ? "Рубашка карты" : resolved.name}
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
