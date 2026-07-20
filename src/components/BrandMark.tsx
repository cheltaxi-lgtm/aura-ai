"use client";

import { useId } from "react";

interface BrandMarkProps {
  size?: number;
  className?: string;
}

/** Zovus logomark — stylized Z in mystic gold ring. */
export default function BrandMark({ size = 28, className }: BrandMarkProps) {
  const uid = useId().replace(/:/g, "");
  const goldId = `zovus-gold-${uid}`;
  const bgId = `zovus-bg-${uid}`;
  const glowId = `zovus-glow-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={goldId} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5E6B8" />
          <stop offset="0.45" stopColor="#E8C77E" />
          <stop offset="1" stopColor="#A8843A" />
        </linearGradient>
        <radialGradient id={bgId} cx="16" cy="14" r="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2a2218" />
          <stop offset="0.55" stopColor="#141210" />
          <stop offset="1" stopColor="#0a0908" />
        </radialGradient>
        <radialGradient id={glowId} cx="16" cy="12" r="10" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C9A24A" stopOpacity="0.35" />
          <stop offset="1" stopColor="#C9A24A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill={`url(#${bgId})`} />
      <rect width="32" height="32" rx="7" fill={`url(#${glowId})`} />
      <circle cx="16" cy="16" r="11.5" stroke={`url(#${goldId})`} strokeWidth="1.1" opacity="0.45" />
      <path
        d="M10.5 10.5h11.5L12 21.5h11.5"
        stroke={`url(#${goldId})`}
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23.2" cy="8.8" r="0.75" fill="#F0D88A" opacity="0.9" />
      <circle cx="8.8" cy="10.2" r="0.55" fill="#E8C77E" opacity="0.65" />
    </svg>
  );
}
