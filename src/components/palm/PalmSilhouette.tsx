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

function PalmDigits() {
  return (
    <>
      <rect x="98" y="250" width="52" height="30" rx="15" />
      <ellipse cx="124" cy="208" rx="50" ry="58" />
      <rect x="52" y="68" width="24" height="128" rx="12" />
      <rect x="82" y="42" width="24" height="154" rx="12" />
      <rect x="114" y="22" width="26" height="174" rx="13" />
      <rect x="148" y="46" width="24" height="150" rx="12" />
      <g transform="rotate(-30 186 178)">
        <rect x="168" y="164" width="82" height="28" rx="14" />
      </g>
    </>
  );
}

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
        viewBox="0 0 260 300"
        className="h-auto w-52"
        style={{
          transform: whichHand === "left" ? "scaleX(-1)" : undefined,
        }}
      >
        <defs>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Right palm facing viewer: 4 fingers up, thumb on the right. */}
        <g
          fill={stroke}
          stroke={stroke}
          strokeWidth="2.2"
          opacity="0.38"
          filter={`url(#${glowId})`}
        >
          <PalmDigits />
        </g>
        <g fill="none" stroke={glow} strokeLinecap="round">
          <path
            d="M92 194c22 24 48 28 68 10"
            strokeWidth="1.6"
            opacity="0.9"
          />
          <path
            d="M98 174c24 6 42 2 58-12"
            strokeWidth="1.4"
            opacity="0.75"
          />
          <path
            d="M104 156c22 2 38-8 50-20"
            strokeWidth="1.3"
            opacity="0.65"
          />
          <path
            d="M130 206c2-32 2-56 0-80"
            strokeWidth="1.2"
            opacity="0.55"
            stroke={stroke}
          />
        </g>
      </svg>
    </div>
  );
}
