"use client";

import BrandMark from "@/components/BrandMark";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { navigateHomeHard } from "@/lib/navigate-home";

interface BrandLogoProps {
  showTagline?: boolean;
  className?: string;
  markSize?: number;
  titleClassName?: string;
  taglineClassName?: string;
  /** Hard navigation to `/` — resets SPA state and closes overlays. */
  linkToHome?: boolean;
}

export default function BrandLogo({
  showTagline = true,
  className = "",
  markSize = 28,
  titleClassName = "font-display text-xl font-bold tracking-wider text-white neon-text sm:text-2xl",
  taglineClassName = "ml-2 hidden text-xs text-gray-600 sm:inline",
  linkToHome = false,
}: BrandLogoProps) {
  const content = (
    <>
      <BrandMark size={markSize} className="shrink-0 pointer-events-none" />
      <div className="min-w-0 pointer-events-none">
        <span className={titleClassName}>{BRAND_NAME}</span>
        {showTagline ? <span className={taglineClassName}>{BRAND_TAGLINE}</span> : null}
      </div>
    </>
  );

  const wrapperClass = `flex min-w-0 shrink items-center gap-1.5 sm:gap-2 ${className}`;

  if (linkToHome) {
    return (
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          navigateHomeHard();
        }}
        className={`brand-logo-home relative z-[5010] inline-flex min-h-11 min-w-[44px] touch-manipulation cursor-pointer select-none ${wrapperClass}`}
        aria-label={`${BRAND_NAME} — на главную`}
      >
        {content}
      </a>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}
