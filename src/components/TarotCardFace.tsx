"use client";

import { resolveTarotCard, tarotCardRoman } from "@/lib/tarot-visuals";
import TarotSigil from "@/components/TarotSigil";

interface TarotCardFaceProps {
  card: { id?: number; name: string; meaning?: string };
  position?: string;
  showMeaning?: boolean;
  size?: "md" | "lg";
  className?: string;
}

export default function TarotCardFace({
  card,
  position,
  showMeaning = true,
  size = "md",
  className = "",
}: TarotCardFaceProps) {
  const resolved = resolveTarotCard(card);
  const sigilId = resolved.id >= 0 ? resolved.id : 0;
  const sizeClass = size === "lg" ? "lux-tarot-card--lg" : "lux-tarot-card--md";
  const meaningWidth = size === "lg" ? "max-w-[180px]" : "max-w-[156px]";

  return (
    <div className={`lux-tarot-wrap group ${className}`}>
      {position && <p className="lux-label">{position}</p>}

      <div className={`lux-tarot-card ${sizeClass}`}>
        <div className="lux-tarot-card__frame" aria-hidden />
        <div className="lux-tarot-card__inner">
          <div className="lux-tarot-card__header">
            <span className="font-display text-[11px] tracking-widest text-aura-champagne">
              {tarotCardRoman(resolved.id)}
            </span>
            <span className="font-display text-[9px] uppercase tracking-[0.2em] text-aura-champagne/60">
              Major
            </span>
          </div>

          <div className="lux-tarot-card__sigil-wrap">
            <div className="lux-tarot-card__halo" aria-hidden />
            <TarotSigil id={sigilId} className="lux-tarot-card__sigil" />
          </div>

          <p className="font-display text-center text-sm font-semibold leading-tight text-aura-ivory">
            {resolved.name}
          </p>
        </div>
        <div className="lux-tarot-card__sheen" aria-hidden />
      </div>

      {showMeaning && resolved.meaning && (
        <p className={`${meaningWidth} mt-2 text-center text-[10px] leading-relaxed text-aura-ivory/50`}>
          {resolved.meaning}
        </p>
      )}
    </div>
  );
}
