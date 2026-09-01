"use client";

import { useId } from "react";

import type { PalmHand, PalmHandShape, PalmVerdict } from "@/lib/palm-constants";

const SHAPE_STROKE: Record<PalmHandShape, string> = {
  earth: "#c9a36a",
  air: "#8ec5e8",
  fire: "#e08b4a",
  water: "#7aa8d8",
};

const VERDICT_GLOW: Record<PalmVerdict, string> = {
  love: "#e08bb0",
  path: "#e8c46a",
  mind: "#8ec5e8",
  vitality: "#3fae7a",
  mixed: "#c9cdd6",
};

export default function PalmSilhouette({
  whichHand,
  handShape,
  verdict,
}: {
  whichHand: PalmHand;
  handShape: PalmHandShape;
  verdict: PalmVerdict;
}) {
  const stroke = SHAPE_STROKE[handShape];
  const glow = VERDICT_GLOW[verdict];
  const glowId = useId().replace(/:/g, "");
  return (
    <div className="mx-auto flex w-full max-w-xs justify-center" aria-hidden>
      <svg
        viewBox="0 0 200 260"
        className="h-auto w-52"
        style={{
          transform: whichHand === "left" ? "scaleX(-1)" : undefined,
        }}
      >
        <defs>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d="M108 248c-28 0-52-18-58-48-4-22-2-48 6-78 3-12 2-24-4-34-8-14-10-30-4-42 5-10 16-14 24-8 6 4 10 12 12 22l6-36c2-12 12-20 22-18s16 12 14 24l-8 42 10-40c3-12 14-18 24-14s14 16 10 28l-14 44 8-28c3-12 14-18 24-14 10 4 14 16 10 26l-18 48c-4 12-2 26 4 36 10 18 14 40 10 58-6 28-32 48-62 48z"
          fill="rgba(255,255,255,0.04)"
          stroke={stroke}
          strokeWidth="2.2"
          filter={`url(#${glowId})`}
        />
        <path
          d="M86 168c18 28 42 36 62 18"
          fill="none"
          stroke={glow}
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M92 150c22 8 40 6 56-8"
          fill="none"
          stroke={glow}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M98 132c20 4 36-2 48-16"
          fill="none"
          stroke={glow}
          strokeWidth="1.3"
          strokeLinecap="round"
          opacity="0.65"
        />
        <path
          d="M110 176c2-28 4-52 2-74"
          fill="none"
          stroke={stroke}
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
    </div>
  );
}
