"use client";

import { useEffect, useRef } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { EDITORIAL_DAILY_CARDS, EDITORIAL_SECTION_IDS } from "@/lib/editorial-landing-content";
import { trackDailyCardsCtaClick, trackDailyCardsOfferView } from "@/lib/seo/metrika";

type EditorialDailyCardsSectionProps = {
  isLoggedIn: boolean;
  /** Authenticated: daily triplet available (rolling 24h). */
  dailyAvailable?: boolean;
  onGuestCta: () => void;
  onOpenDaily?: () => void;
  onViewToday?: () => void;
};

export default function EditorialDailyCardsSection({
  isLoggedIn,
  dailyAvailable = true,
  onGuestCta,
  onOpenDaily,
  onViewToday,
}: EditorialDailyCardsSectionProps) {
  const { ref, className } = useScrollReveal<HTMLElement>();
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    trackDailyCardsOfferView(isLoggedIn ? "landing_auth" : "landing_guest");
  }, [isLoggedIn]);

  const ctaLabel = !isLoggedIn
    ? EDITORIAL_DAILY_CARDS.guestCta
    : dailyAvailable
      ? EDITORIAL_DAILY_CARDS.authAvailableCta
      : EDITORIAL_DAILY_CARDS.authUsedCta;

  const onClick = () => {
    trackDailyCardsCtaClick(
      !isLoggedIn ? "landing_guest" : dailyAvailable ? "landing_auth_available" : "landing_auth_used"
    );
    if (!isLoggedIn) {
      onGuestCta();
      return;
    }
    if (dailyAvailable) onOpenDaily?.();
    else onViewToday?.();
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
          <button type="button" className="editorial-btn editorial-btn--gold" onClick={onClick}>
            {ctaLabel}
          </button>
        </div>
        {!isLoggedIn ? (
          <p className="mt-3 text-xs text-white/45 salon-reveal__item" style={{ ["--salon-i" as string]: 4 }}>
            Сначала откройте стартовый расклад или войдите — карты дня доступны после регистрации.
          </p>
        ) : null}
      </div>
    </section>
  );
}

// Keep section id registry discoverable for SEO/internal links.
void EDITORIAL_SECTION_IDS;
