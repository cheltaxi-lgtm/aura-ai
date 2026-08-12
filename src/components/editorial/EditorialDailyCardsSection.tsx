"use client";

import { useEffect, useRef } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import type { DailyCardsUiState } from "@/lib/daily-cards-ui";
import { EDITORIAL_DAILY_CARDS, EDITORIAL_SECTION_IDS } from "@/lib/editorial-landing-content";
import { trackDailyCardsCtaClick, trackDailyCardsOfferView } from "@/lib/seo/metrika";

type EditorialDailyCardsSectionProps = {
  isLoggedIn: boolean;
  /** Authenticated daily triplet UI state (loading until cooldown ready). */
  dailyState?: DailyCardsUiState;
  onGuestCta: () => void;
  onOpenDaily?: () => void;
  onViewToday?: () => void;
};

export default function EditorialDailyCardsSection({
  isLoggedIn,
  dailyState = "loading",
  onGuestCta,
  onOpenDaily,
  onViewToday,
}: EditorialDailyCardsSectionProps) {
  const { ref, className } = useScrollReveal<HTMLElement>();
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    if (isLoggedIn && dailyState === "loading") return;
    viewed.current = true;
    trackDailyCardsOfferView(isLoggedIn ? "landing_auth" : "landing_guest");
  }, [isLoggedIn, dailyState]);

  const ctaLabel = !isLoggedIn
    ? EDITORIAL_DAILY_CARDS.guestCta
    : dailyState === "available"
      ? EDITORIAL_DAILY_CARDS.authAvailableCta
      : dailyState === "used"
        ? EDITORIAL_DAILY_CARDS.authUsedCta
        : EDITORIAL_DAILY_CARDS.authLoadingLabel;

  const onClick = () => {
    if (isLoggedIn && dailyState === "loading") return;
    trackDailyCardsCtaClick(
      !isLoggedIn
        ? "landing_guest"
        : dailyState === "available"
          ? "landing_auth_available"
          : "landing_auth_used"
    );
    if (!isLoggedIn) {
      onGuestCta();
      return;
    }
    if (dailyState === "available") onOpenDaily?.();
    else if (dailyState === "used") onViewToday?.();
  };

  return (
    <section
      ref={ref}
      id="карты-дня"
      className={`editorial-section scroll-mt-24 ${className}`}
      aria-labelledby="editorial-daily-cards-title"
    >
      <div className="editorial-landing__inner max-w-3xl">
        <p className="editorial-section__kicker salon-reveal__item">{EDITORIAL_DAILY_CARDS.kicker}</p>
        <h2
          id="editorial-daily-cards-title"
          className="editorial-section__title salon-reveal__item"
          style={{ ["--salon-i" as string]: 0 }}
        >
          {EDITORIAL_DAILY_CARDS.title}
        </h2>
        <p
          className="editorial-section__subtitle salon-reveal__item"
          style={{ ["--salon-i" as string]: 1 }}
        >
          {EDITORIAL_DAILY_CARDS.subtitle}
        </p>
        <p
          className="mt-3 text-sm text-white/60 salon-reveal__item"
          style={{ ["--salon-i" as string]: 2 }}
        >
          {EDITORIAL_DAILY_CARDS.body}
        </p>
        <div className="mt-6 salon-reveal__item" style={{ ["--salon-i" as string]: 3 }}>
          <button
            type="button"
            className="editorial-btn editorial-btn--gold"
            onClick={onClick}
            disabled={isLoggedIn && dailyState === "loading"}
            aria-busy={isLoggedIn && dailyState === "loading" ? true : undefined}
          >
            {ctaLabel}
          </button>
        </div>
        {!isLoggedIn ? (
          <p className="mt-3 text-xs text-white/45 salon-reveal__item" style={{ ["--salon-i" as string]: 4 }}>
            {EDITORIAL_DAILY_CARDS.guestCtaHint}
          </p>
        ) : null}
      </div>
    </section>
  );
}

// Keep section id registry discoverable for SEO/internal links.
void EDITORIAL_SECTION_IDS;
