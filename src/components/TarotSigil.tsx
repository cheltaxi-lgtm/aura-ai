import type { ReactNode } from "react";

/** Refined gold line-art emblems for Major Arcana (SVG, no emoji). */
export default function TarotSigil({ id, className = "" }: { id: number; className?: string }) {
  const stroke = "currentColor";
  const sw = 1.25;

  const paths: Record<number, ReactNode> = {
    0: (
      <>
        <circle cx="32" cy="32" r="14" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M32 18v6M32 40v6M18 32h6M40 32h6" stroke={stroke} strokeWidth={sw} />
        <circle cx="32" cy="26" r="2" fill={stroke} />
      </>
    ),
    1: (
      <>
        <path d="M32 12v40M24 20h16M22 28c4-4 16-4 20 0M22 36c4 4 16 4 20 0" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M28 44l4-8 4 8" stroke={stroke} strokeWidth={sw} fill="none" />
      </>
    ),
    2: (
      <>
        <path d="M32 14c-8 0-12 6-12 12 0 8 12 18 12 18s12-10 12-18c0-6-4-12-12-12z" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M26 28c2 2 10 2 12 0" stroke={stroke} strokeWidth={sw} fill="none" />
      </>
    ),
    3: (
      <>
        <path d="M32 16v32M20 24c6-6 18-6 24 0M20 40c6 6 18 6 24 0" stroke={stroke} strokeWidth={sw} fill="none" />
        <circle cx="32" cy="32" r="6" stroke={stroke} strokeWidth={sw} fill="none" />
      </>
    ),
    4: (
      <>
        <path d="M22 44V24l10-8 10 8v20" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M18 44h28" stroke={stroke} strokeWidth={sw} />
        <path d="M28 32h8" stroke={stroke} strokeWidth={sw} />
      </>
    ),
    5: (
      <>
        <path d="M32 14v28M24 22h16M24 30h16M24 38h16" stroke={stroke} strokeWidth={sw} />
        <path d="M26 18l6-4 6 4" stroke={stroke} strokeWidth={sw} fill="none" />
      </>
    ),
    6: (
      <>
        <path d="M24 28c0-6 4-10 8-10s8 4 8 10-8 14-8 14-8-8-8-14z" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M32 42v6M28 48h8" stroke={stroke} strokeWidth={sw} />
      </>
    ),
    7: (
      <>
        <path d="M16 40h32M20 40V28l12-8 12 8v12" stroke={stroke} strokeWidth={sw} fill="none" />
        <circle cx="32" cy="24" r="4" stroke={stroke} strokeWidth={sw} fill="none" />
      </>
    ),
    8: (
      <>
        <path d="M32 16c-8 4-12 12-8 20 4 8 16 8 20 0" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M28 36h8v8h-8z" stroke={stroke} strokeWidth={sw} fill="none" />
      </>
    ),
    9: (
      <>
        <path d="M32 44V28M32 28c-6 0-10-4-10-8s4-8 10-8 10 4 10 8-4 8-10 8z" stroke={stroke} strokeWidth={sw} fill="none" />
        <circle cx="32" cy="18" r="3" fill={stroke} />
      </>
    ),
    10: (
      <>
        <circle cx="32" cy="32" r="16" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M32 16v32M16 32h32M22 22l20 20M42 22L22 42" stroke={stroke} strokeWidth={0.75} opacity="0.6" />
      </>
    ),
    11: (
      <>
        <path d="M32 14v28M24 22h16M24 38h16" stroke={stroke} strokeWidth={sw} />
        <path d="M26 14h12" stroke={stroke} strokeWidth={sw} />
      </>
    ),
    12: (
      <>
        <path d="M32 16v24M26 22h12" stroke={stroke} strokeWidth={sw} />
        <circle cx="32" cy="44" r="4" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M20 28c4-8 20-8 24 0" stroke={stroke} strokeWidth={sw} fill="none" />
      </>
    ),
    13: (
      <>
        <path d="M24 20h16v24c0 4-16 4-16 0V20z" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M28 28h8M28 34h8" stroke={stroke} strokeWidth={sw} />
      </>
    ),
    14: (
      <>
        <path d="M32 14v36M24 26h16M20 38c4-4 20-4 24 0" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M28 22l4-6 4 6" stroke={stroke} strokeWidth={sw} fill="none" />
      </>
    ),
    15: (
      <>
        <path d="M26 18h12l-2 28h-8L26 18z" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M22 46h20" stroke={stroke} strokeWidth={sw} />
        <circle cx="32" cy="14" r="2" fill={stroke} />
      </>
    ),
    16: (
      <>
        <path d="M22 44V20l10-6 10 6v24" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M18 44h28M26 32h12" stroke={stroke} strokeWidth={sw} />
        <path d="M32 14l4 8-4 4-4-4 4-8z" stroke={stroke} strokeWidth={sw} fill="none" />
      </>
    ),
    17: (
      <>
        <path d="M32 14l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9l3-9z" stroke={stroke} strokeWidth={sw} fill="none" />
      </>
    ),
    18: (
      <>
        <path d="M32 16c-10 0-14 8-10 16 2 5 10 8 10 8s8-3 10-8c4-8 0-16-10-16z" stroke={stroke} strokeWidth={sw} fill="none" />
        <circle cx="28" cy="30" r="1.5" fill={stroke} />
        <circle cx="36" cy="34" r="1" fill={stroke} />
      </>
    ),
    19: (
      <>
        <circle cx="32" cy="32" r="12" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M32 14v6M32 44v6M14 32h6M44 32h6" stroke={stroke} strokeWidth={sw} />
      </>
    ),
    20: (
      <>
        <path d="M24 40V24l8-8 8 8v16" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M20 40h24M28 32h8" stroke={stroke} strokeWidth={sw} />
        <path d="M32 16v4" stroke={stroke} strokeWidth={sw} />
      </>
    ),
    21: (
      <>
        <circle cx="32" cy="32" r="14" stroke={stroke} strokeWidth={sw} fill="none" />
        <ellipse cx="32" cy="32" rx="14" ry="5" stroke={stroke} strokeWidth={sw} fill="none" />
        <path d="M32 18v28" stroke={stroke} strokeWidth={sw} />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 64 64"
      className={`lux-tarot-sigil ${className}`}
      aria-hidden
      fill="none"
    >
      {paths[id] ?? (
        <path
          d="M32 12l6 12 12 2-9 9 2 12-11-6-11 6 2-12-9-9 12-2 6-12z"
          stroke={stroke}
          strokeWidth={sw}
        />
      )}
    </svg>
  );
}
