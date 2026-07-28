"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { DeckSystem } from "@/lib/decks/types";
import { deckBackPath, resolveDeckCard, resolveDeckSystem, DECK_ACCENT_CLASS } from "@/lib/deck-card-utils";
import { getDeckImagePath } from "@/data/decks";
import { deckImageSources } from "@/lib/deck-image-url";
import { isDeckFaceVerified, markDeckFaceVerified } from "@/lib/deck-face-loader";
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
  /** Eager-load face (photo confirm / above-the-fold) */
  priority?: boolean;
  /** Fires once when the face is painted or reaches a terminal placeholder. */
  onFaceReady?: () => void;
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

function debugDeckFaceLog(
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string
) {
  // #region agent log
  fetch("/api/debug/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "5da396",
      runId: "face-preload",
      hypothesisId,
      location: "DeckCard.tsx:DeckFaceImage",
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function DeckFaceImage({
  imageSrc,
  alt,
  size,
  imageFitClass,
  priority = false,
  onFaceReady,
}: {
  imageSrc: string;
  alt: string;
  size: "sm" | "md" | "lg";
  imageFitClass: string;
  priority?: boolean;
  onFaceReady?: () => void;
}) {
  const { webp, fallback } = deckImageSources(imageSrc);
  const isDeckAsset = imageSrc.startsWith("/decks/") || webp.endsWith(".svg");
  const [src, setSrc] = useState(webp);
  const [failed, setFailed] = useState(false);
  const startedAtRef = useRef(performance.now());
  /** Bumps on src identity change / unmount — stale abort onError must not escalate to ✦. */
  const genRef = useRef(0);
  const attemptRef = useRef(0);
  const readySentRef = useRef(false);
  const onFaceReadyRef = useRef(onFaceReady);
  onFaceReadyRef.current = onFaceReady;

  const emitReady = () => {
    if (readySentRef.current) return;
    readySentRef.current = true;
    onFaceReadyRef.current?.();
  };

  useEffect(() => {
    genRef.current += 1;
    const gen = genRef.current;
    attemptRef.current = 0;
    readySentRef.current = false;
    startedAtRef.current = performance.now();
    setSrc(webp);
    setFailed(false);
    return () => {
      // Invalidate deferred onError from this mount (abort-on-unmount).
      if (genRef.current === gen) genRef.current += 1;
    };
  }, [webp, fallback]);

  useEffect(() => {
    if (failed) emitReady();
  }, [failed]);

  if (!isDeckAsset) {
    return (
      <Image
        src={webp}
        alt={alt}
        fill
        sizes={DECK_IMAGE_SIZES[size]}
        className={imageFitClass}
        priority={priority}
        {...(priority ? {} : { loading: "lazy" as const })}
        onLoad={() => emitReady()}
        onError={() => {
          setFailed(true);
          emitReady();
        }}
      />
    );
  }

  if (failed) {
    return (
      <div className="lux-detected-card-face" aria-label={alt}>
        <span className="lux-detected-card-face__glyph" aria-hidden>
          ✦
        </span>
        <span className="lux-detected-card-face__name">{alt}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`${imageFitClass} absolute inset-0 h-full w-full`}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      onLoad={(e) => {
        markDeckFaceVerified(webp);
        debugDeckFaceLog(
          "img_ok",
          {
            alt,
            src,
            attempt: attemptRef.current,
            ms: Math.round(performance.now() - startedAtRef.current),
            naturalW: e.currentTarget.naturalWidth,
            naturalH: e.currentTarget.naturalHeight,
          },
          "A"
        );
        emitReady();
      }}
      onError={() => {
        const gen = genRef.current;
        const from = src;
        // Defer: remount aborts fire sync and all at once (2nd confirm). Real failures persist.
        window.setTimeout(() => {
          if (gen !== genRef.current) {
            debugDeckFaceLog("img_error_stale", { alt, from }, "C");
            return;
          }
          const attempt = attemptRef.current;
          // Already painted this session — re-point at webp from HTTP cache, never ✦.
          if (isDeckFaceVerified(webp)) {
            debugDeckFaceLog("img_error_recover", { alt, from, attempt }, "C");
            attemptRef.current = attempt + 1;
            setSrc(`${webp}${webp.includes("?") ? "&" : "?"}r=${Date.now()}`);
            return;
          }
          if (attempt === 0 && fallback !== webp) {
            debugDeckFaceLog("img_fallback_png", { alt, from, to: fallback }, "E");
            attemptRef.current = 1;
            setSrc(fallback);
            return;
          }
          if (attempt <= 2) {
            debugDeckFaceLog("img_retry_webp", { alt, from, attempt }, "E");
            attemptRef.current = attempt + 1;
            setSrc(`${webp}${webp.includes("?") ? "&" : "?"}r=${Date.now()}`);
            return;
          }
          debugDeckFaceLog("img_failed", { alt, from, attempt }, "E");
          setFailed(true);
        }, 80);
      }}
    />
  );
}

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
  priority = false,
  onFaceReady,
}: DeckCardProps) {
  const system = resolveDeckSystem(systemProp, masterId);
  const onFaceReadyRef = useRef(onFaceReady);
  onFaceReadyRef.current = onFaceReady;
  const symbolicReadySentRef = useRef(false);

  useEffect(() => {
    symbolicReadySentRef.current = false;
  }, [imagePathProp, card.imagePath, card.name, detectedOnly, faceDown]);
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
  const imageFitClass =
    effectiveSystem === "lenormand" || Boolean(imageSrc?.endsWith(".svg"))
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

  const emitSymbolicReady = () => {
    if (symbolicReadySentRef.current) return;
    symbolicReadySentRef.current = true;
    onFaceReadyRef.current?.();
  };

  useEffect(() => {
    if (showDetectedFace || showNumerologyFace || showLenormandFace || (!imageSrc && !faceDown)) {
      emitSymbolicReady();
    }
  }, [
    showDetectedFace,
    showNumerologyFace,
    showLenormandFace,
    imageSrc,
    faceDown,
  ]);

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
                <DeckFaceImage
                  imageSrc={imageSrc}
                  alt={faceDown ? "Рубашка" : resolved.name}
                  size={size}
                  imageFitClass={imageFitClass}
                  priority={priority}
                  onFaceReady={() => onFaceReadyRef.current?.()}
                />
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
