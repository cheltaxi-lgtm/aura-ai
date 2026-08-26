"use client";

import { useEffect, useRef, useState } from "react";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { useAuth } from "@/lib/useAuth";
import type { RuneActionType } from "@/lib/rune-costs";
import { trackSeoEvent } from "@/lib/seo/metrika";

/** Plural forms for count phrases: [«разбор», «разбора», «разборов»]. */
type Unit = [one: string, few: string, many: string];

type HeroContext = "photo" | "hd" | "natal" | "matrix" | "generic";

type StarterRunesValueProps = {
  /** badge — compact pill; line — quiet hero accent; hero — dominant auth-screen block. */
  variant?: "badge" | "hero" | "line";
  className?: string;
  /**
   * Rune cost key of the promoted product. Enables contextual «хватит на N …»
   * math from the live server config — prices are never hardcoded here.
   */
  costKey?: RuneActionType;
  /** Product unit plural forms for the count phrase. */
  unit?: Unit;
  /** Accusative phrase when the starter package covers exactly one purchase («этот полный разбор»). */
  coversOneText?: string;
  /** generic — no per-product math, just the starter fact (e.g. Tarot guest gate). */
  generic?: boolean;
  /** Analytics product key for the starter_value_view event. */
  product?: string;
};

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function detectHeroContext(returnTo: string): HeroContext {
  if (returnTo.includes("photo=1")) return "photo";
  if (returnTo.includes("dizayn-cheloveka")) return "hd";
  if (returnTo.includes("natalnaya-karta")) return "natal";
  if (returnTo.includes("numerology")) return "matrix";
  return "generic";
}

/**
 * Starter-package value proposition. Display only — no entitlement logic.
 * Renders nothing until the rune config actually came from the server, so the
 * numbers always match what the server will really grant (never the client
 * fallback, never a hardcoded constant). Renders nothing for authenticated
 * users — existing accounts must never see a new-user welcome promise.
 */
export default function StarterRunesValue({
  variant = "badge",
  className = "",
  costKey,
  unit,
  coversOneText,
  generic = false,
  product,
}: StarterRunesValueProps) {
  const { config, fromServer } = useRuneConfig();
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [heroContext, setHeroContext] = useState<HeroContext>("generic");
  const trackedRef = useRef(false);

  useEffect(() => {
    try {
      const returnTo = new URLSearchParams(window.location.search).get("returnTo") ?? "";
      setHeroContext(detectHeroContext(returnTo));
    } catch {
      /* no product context */
    }
  }, []);

  const shown = fromServer && config.starterRunes > 0 && !authLoading && !isLoggedIn;

  useEffect(() => {
    if (!shown || trackedRef.current) return;
    trackedRef.current = true;
    trackSeoEvent("starter_value_view", {
      product: product ?? heroContext,
      variant,
    });
  }, [shown, product, variant, heroContext]);

  if (!shown) return null;

  const starter = config.starterRunes;
  const guestIncludedNote =
    product === "tarot_guest"
      ? `Полный разбор этих карт уже включён — стартовые ${starter} ᚢ тратить на него не нужно.`
      : null;

  if (variant === "line") {
    return (
      <p className={`editorial-hero__starter-line ${className}`.trim()}>
        При первой регистрации — стартовые {starter} ᚢ
      </p>
    );
  }

  if (variant === "hero") {
    const photoCost = config.costs.VISION_ANALYSIS || 30;
    const readingCost = config.costs.READING || 15;
    const photoCount = Math.floor(starter / photoCost);
    const readingCount = Math.floor(starter / readingCost);
    const genericLine =
      photoCount > 0 && readingCount > 0
        ? `Хватит на ${photoCount} ${pluralRu(photoCount, "фото-расклад", "фото-расклада", "фото-раскладов")} или ${readingCount} ${pluralRu(readingCount, "расклад", "расклада", "раскладов")} Таро с мастером.`
        : "Начисляются на баланс сразу после создания аккаунта.";

    let line = genericLine;
    if (heroContext === "photo" && photoCount > 0) {
      line = `Хватит на ${photoCount} ${pluralRu(photoCount, "фото-расклад", "фото-расклада", "фото-раскладов")} по ${photoCost} ᚢ — после регистрации продолжите свой расклад.`;
    } else if (heroContext === "hd") {
      const hdCost = config.costs.HD_REPORT || 300;
      if (starter >= hdCost) {
        line = `Хватит на полный разбор Дизайна человека (${hdCost} ᚢ) — после регистрации продолжите с того же места.`;
      }
    } else if (heroContext === "natal") {
      const natalCost = config.costs.NATAL_READING || 300;
      if (starter >= natalCost) {
        line = `Хватит на полную натальную трактовку (${natalCost} ᚢ) — карта сохранится в кабинете.`;
      }
    } else if (heroContext === "matrix") {
      const matrixCost = config.costs.NUMEROLOGY_SESSION || 100;
      const matrixCount = Math.floor(starter / matrixCost);
      if (matrixCount >= 2) {
        line = `Хватит на ${matrixCount} ${pluralRu(matrixCount, "полный разбор", "полных разбора", "полных разборов")} Матрицы судьбы по ${matrixCost} ᚢ.`;
      } else if (matrixCount === 1) {
        line = "Хватит на полный разбор Матрицы судьбы.";
      }
    }

    return (
      <div
        className={`rounded-2xl border border-aura-gold/30 bg-aura-gold/[0.07] px-5 py-4 text-center ${className}`.trim()}
      >
        <p className="font-display text-lg font-semibold text-aura-champagne">
          При первой регистрации — стартовые {starter} ᚢ
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-aura-ivory/70">{line}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-aura-ivory/40">
          ᚢ — руны, внутренняя валюта Zovus. Начисляются один раз при первой регистрации.
        </p>
      </div>
    );
  }

  let valueLine: string | null = null;
  if (costKey && unit) {
    const price = config.costs[costKey] ?? 0;
    if (price > 0) {
      const count = Math.floor(starter / price);
      if (count >= 2) {
        valueLine = `хватит на ${count} ${pluralRu(count, unit[0], unit[1], unit[2])}`;
      } else if (count === 1) {
        valueLine = `хватит на ${coversOneText ?? unit[0]}`;
      }
    }
  } else if (!generic) {
    // Legacy default (Photo Conversion Pass placements): photo-reading math.
    const photoCost = config.costs.VISION_ANALYSIS || 30;
    const photoCount = Math.floor(starter / photoCost);
    if (photoCount > 0) {
      valueLine = `хватит на ${photoCount} ${pluralRu(photoCount, "фото-расклад", "фото-расклада", "фото-раскладов")}`;
    }
  }

  const badge = (
    <p
      className={`inline-flex flex-wrap items-center justify-center gap-x-1.5 rounded-full border border-aura-gold/25 bg-aura-gold/[0.08] px-3.5 py-1.5 text-xs text-aura-champagne/90 ${guestIncludedNote ? "" : className}`.trim()}
    >
      <span aria-hidden>✦</span>
      <span>
        При первой регистрации — стартовые {starter} ᚢ
        {valueLine ? ` · ${valueLine}` : ""}
      </span>
    </p>
  );

  if (!guestIncludedNote) return badge;

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      {badge}
      <p className="text-center text-xs leading-relaxed text-aura-ivory/70">
        {guestIncludedNote}
      </p>
    </div>
  );
}
