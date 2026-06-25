interface BrandMarkProps {
  size?: number;
  className?: string;
}

/** Zovus logomark — stylized Z in mystic gold ring. */
export default function BrandMark({ size = 28, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="zovus-gold" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5E6B8" />
          <stop offset="0.45" stopColor="#E8C77E" />
          <stop offset="1" stopColor="#A8843A" />
        </linearGradient>
        <radialGradient id="zovus-bg" cx="16" cy="14" r="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3D2858" />
          <stop offset="0.55" stopColor="#1A0F2E" />
          <stop offset="1" stopColor="#07050F" />
        </radialGradient>
        <radialGradient id="zovus-glow" cx="16" cy="12" r="10" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C9A24A" stopOpacity="0.35" />
          <stop offset="1" stopColor="#C9A24A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="url(#zovus-bg)" />
      <rect width="32" height="32" rx="7" fill="url(#zovus-glow)" />
      <circle cx="16" cy="16" r="11.5" stroke="url(#zovus-gold)" strokeWidth="1.1" opacity="0.45" />
      <path
        d="M10.5 10.5h11.5L12 21.5h11.5"
        stroke="url(#zovus-gold)"
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23.2" cy="8.8" r="0.75" fill="#F0D88A" opacity="0.9" />
      <circle cx="8.8" cy="10.2" r="0.55" fill="#E8C77E" opacity="0.65" />
    </svg>
  );
}
