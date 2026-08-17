"use client";

import { useEffect, useState } from "react";
import { useRuneConfig } from "@/lib/useRuneConfig";

type StarterRunesValueProps = {
  /** badge — compact pill for landing/modal; hero — dominant block for the auth screen. */
  variant?: "badge" | "hero";
  className?: string;
};

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/**
 * Starter-package value proposition. Display only — no entitlement logic.
 * Renders nothing until the rune config actually came from the server, so the
 * numbers always match what the server will really grant (never the client
 * fallback, never a hardcoded constant).
 */
export default function StarterRunesValue({
  variant = "badge",
  className = "",
}: StarterRunesValueProps) {
  const { config, fromServer } = useRuneConfig();
  const [photoContext, setPhotoContext] = useState(false);

  useEffect(() => {
    try {
      const returnTo = new URLSearchParams(window.location.search).get("returnTo") ?? "";
      setPhotoContext(returnTo.includes("photo=1"));
    } catch {
      /* no photo context */
    }
  }, []);

  if (!fromServer || config.starterRunes <= 0) return null;

  const photoCost = config.costs.VISION_ANALYSIS || 30;
  const readingCost = config.costs.READING || 15;
  const photoCount = Math.floor(config.starterRunes / photoCost);
  const readingCount = Math.floor(config.starterRunes / readingCost);
  const photoWord = pluralRu(photoCount, "фото-расклад", "фото-расклада", "фото-раскладов");
  const readingWord = pluralRu(readingCount, "расклад", "расклада", "раскладов");

  if (variant === "hero") {
    return (
      <div
        className={`rounded-2xl border border-aura-gold/30 bg-aura-gold/[0.07] px-5 py-4 text-center ${className}`.trim()}
      >
        <p className="font-display text-lg font-semibold text-aura-champagne">
          Новым пользователям — стартовые {config.starterRunes} ᚢ
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-aura-ivory/70">
          {photoContext && photoCount > 0
            ? `Хватит на ${photoCount} ${photoWord} по ${photoCost} ᚢ — после регистрации продолжите свой расклад.`
            : photoCount > 0 && readingCount > 0
              ? `Хватит на ${photoCount} ${photoWord} или ${readingCount} ${readingWord} Таро с мастером.`
              : "Начисляются на баланс сразу после создания аккаунта."}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-aura-ivory/40">
          ᚢ — руны, внутренняя валюта Zovus. Начисляются один раз при создании аккаунта.
        </p>
      </div>
    );
  }

  return (
    <p
      className={`inline-flex flex-wrap items-center justify-center gap-x-1.5 rounded-full border border-aura-gold/25 bg-aura-gold/[0.08] px-3.5 py-1.5 text-xs text-aura-champagne/90 ${className}`.trim()}
    >
      <span aria-hidden>✦</span>
      <span>
        Новым пользователям — {config.starterRunes} ᚢ
        {photoCount > 0 ? ` · хватит на ${photoCount} ${photoWord}` : ""}
      </span>
    </p>
  );
}
