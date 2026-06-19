"use client";

import { resolveTarotCard, tarotCardRoman, tarotCardVisual } from "@/lib/tarot-visuals";

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
  const visual = tarotCardVisual(resolved);
  const cardWidth = size === "lg" ? "max-w-[172px]" : "max-w-[148px]";
  const meaningWidth = size === "lg" ? "max-w-[172px]" : "max-w-[148px]";

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {position && (
        <p className="text-[10px] uppercase tracking-widest text-aura-gold">{position}</p>
      )}

      <div
        className={`relative flex aspect-[5/8] w-full ${cardWidth} flex-col items-center justify-between overflow-hidden rounded-xl border bg-gradient-to-br p-3 ${visual.border} ${visual.gradient} ${visual.glow}`}
      >
        <div className="flex w-full items-start justify-between text-[10px] text-aura-gold/80">
          <span>{tarotCardRoman(resolved.id)}</span>
          <span className="opacity-60">Major</span>
        </div>

        <span className={`drop-shadow-lg ${size === "lg" ? "text-5xl" : "text-4xl"}`} aria-hidden>
          {visual.symbol}
        </span>

        <p
          className={`font-display text-center font-bold leading-tight text-white ${size === "lg" ? "text-base" : "text-sm"}`}
        >
          {resolved.name}
        </p>

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_55%)]" />
      </div>

      {showMeaning && resolved.meaning && (
        <p className={`${meaningWidth} text-center text-[10px] leading-snug text-gray-500`}>
          {resolved.meaning}
        </p>
      )}
    </div>
  );
}
