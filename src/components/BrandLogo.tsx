"use client";

import BrandMark from "@/components/BrandMark";
import { BRAND_NAME, BRAND_TAGLINE, BRAND_WORDMARK } from "@/lib/brand";
import { navigateHomeHard } from "@/lib/navigate-home";

interface BrandLogoProps {
  showTagline?: boolean;
  /** Small beta label — project is in active development. */
  showBeta?: boolean;
  className?: string;
  markSize?: number;
  titleClassName?: string;
  taglineClassName?: string;
  /** Below `sm`, show only the mark — saves header space on mobile. */
  iconOnlyOnMobile?: boolean;
  /** Hard navigation to `/` — resets SPA state and closes overlays. */
  linkToHome?: boolean;
}

export default function BrandLogo({
  showTagline = true,
  showBeta = true,
  className = "",
  markSize = 28,
  titleClassName = "font-display text-xl font-semibold tracking-[0.14em] text-aura-ivory sm:text-2xl",
  taglineClassName = "ml-2 hidden text-xs text-gray-600 sm:inline",
  iconOnlyOnMobile = false,
  linkToHome = false,
}: BrandLogoProps) {
  const wordmarkClass = iconOnlyOnMobile ? "hidden min-w-0 sm:block" : "min-w-0";

  const betaBadge = showBeta ? (
    <span
      className="brand-beta-badge"
      title="Проект в активной доработке — функции и интерфейс могут меняться"
    >
      beta
    </span>
  ) : null;

  const mobileBeta =
    showBeta && iconOnlyOnMobile ? (
      <span
        className="brand-beta-badge brand-beta-badge--mobile sm:hidden"
        title="Проект в активной доработке — функции и интерфейс могут меняться"
      >
        beta
      </span>
    ) : null;

  const content = (
    <>
      <span className="brand-logo__lockup inline-flex shrink-0 items-center">
        <BrandMark size={markSize} className="brand-logo__mark shrink-0 pointer-events-none" />
        {mobileBeta}
        <span className={`${wordmarkClass} inline-flex items-center`}>
          <span className={`brand-logo__wordmark ${titleClassName}`}>{BRAND_WORDMARK}</span>
          {betaBadge}
        </span>
      </span>
      {showTagline ? (
        <span className={`${wordmarkClass} ${taglineClassName} pointer-events-none`}>{BRAND_TAGLINE}</span>
      ) : null}
    </>
  );

  const wrapperClass = `flex shrink-0 items-center gap-0 ${className}`;

  if (linkToHome) {
    return (
      // Hard home reset via navigateHomeHard — not a plain client route transition.
      // eslint-disable-next-line @next/next/no-html-link-for-pages
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          navigateHomeHard();
        }}
        className={`brand-logo-home relative z-[5010] inline-flex min-h-11 touch-manipulation cursor-pointer select-none ${wrapperClass}`}
        aria-label={`${BRAND_NAME} — на главную`}
      >
        {content}
      </a>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}
