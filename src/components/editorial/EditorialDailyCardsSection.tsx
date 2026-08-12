"use client";

import { useEffect, useRef } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import type { DailyCardsUiState } from "@/lib/daily-cards-ui";
import { EDITORIAL_DAILY_CARDS, EDITORIAL_SECTION_IDS } from "@/lib/editorial-landing-content";
import { trackDailyCardsCtaClick, trackDailyCardsOfferView } from "@/lib/seo/metrika";

function normalizeCooldownPhrase(hint: string): string {
  const trimmed = hint.trim();
  const through = trimmed.match(/через\s+(.+)$/i);
  if (through?.[1]) return `через ${through[1].trim()}`;
  return trimmed;
}

type EditorialDailyCardsSectionProps = {
  isLoggedIn: boolean;
  dailyState?: DailyCardsUiState;
  dailyCooldownHint?: string | null;
  onGuestCta: () => void;
  onOpenDaily?: () => void;
  onViewToday?: () => void;
  onPickRegular?: () => void;
};

export default function EditorialDailyCardsSection({
  isLoggedIn,
  dailyState = "loading",
  dailyCooldownHint,
  onGuestCta,
  onOpenDaily,
  onViewToday,
  onPickRegular,
}: EditorialDailyCardsSectionProps) {
  const { ref, className } = useScrollReveal<HTMLElement>();
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    if (isLoggedIn && dailyState === "loading") return;
    viewed.current = true;
    trackDailyCardsOfferView(isLoggedIn ? "landing_auth" : "landing_guest");
  }, [isLoggedIn, dailyState]);

  const title = !isLoggedIn
    ? EDITORIAL_DAILY_CARDS.title
    : dailyState === "available"
      ? EDITORIAL_DAILY_CARDS.authAvailableTitle
      : dailyState === "opened"
        ? EDITORIAL_DAILY_CARDS.authOpenedTitle
        : dailyState === "cooldown"
          ? dailyCooldownHint?.trim()
            ? `Следующие карты дня появятся ${normalizeCooldownPhrase(dailyCooldownHint)}`
            : EDITORIAL_DAILY_CARDS.authCooldownTitle
          : EDITORIAL_DAILY_CARDS.authLoadingLabel;

  const subtitle = !isLoggedIn
    ? EDITORIAL_DAILY_CARDS.subtitle
    : dailyState === "available"
      ? EDITORIAL_DAILY_CARDS.authAvailableSubtitle
      : dailyState === "opened"
        ? EDITORIAL_DAILY_CARDS.authOpenedSubtitle
        : dailyState === "cooldown"
          ? EDITORIAL_DAILY_CARDS.authCooldownSubtitle
          : "Уточняем доступ к картам дня.";

  const ctaLabel = !isLoggedIn
    ? EDITORIAL_DAILY_CARDS.guestCta
    : dailyState === "available"
      ? EDITORIAL_DAILY_CARDS.authAvailableCta
      : dailyState === "opened"
        ? EDITORIAL_DAILY_CARDS.authOpenedCta
        : dailyState === "cooldown"
          ? EDITORIAL_DAILY_CARDS.authCooldownCta
          : EDITORIAL_DAILY_CARDS.authLoadingLabel;

  const microcopy = !isLoggedIn
    ? EDITORIAL_DAILY_CARDS.guestCtaHint
    : dailyState === "available"
      ? EDITORIAL_DAILY_CARDS.authAvailableHint
      : null;

  const onClick = () => {
    if (isLoggedIn && dailyState === "loading") return;
    trackDailyCardsCtaClick(
      !isLoggedIn
        ? "landing_guest"
        : dailyState === "available"
          ? "landing_auth_available"
          : dailyState === "opened"
            ? "landing_auth_opened"
            : "landing_auth_cooldown"
    );
    if (!isLoggedIn) {
      onGuestCta();
      return;
    }
    if (dailyState === "available") onOpenDaily?.();
    else if (dailyState === "opened") onViewToday?.();
    else if (dailyState === "cooldown") onPickRegular?.();
  };

  const showAuthCta =
    !isLoggedIn ||
    dailyState === "available" ||
    dailyState === "opened" ||
    (dailyState === "cooldown" && Boolean(onPickRegular));

  return (
    <section
      ref={ref}
      id="карты-дня"
      className={`editorial-section editorial-daily-ritual scroll-mt-24 ${className}`}
      aria-labelledby="editorial-daily-cards-title"
    >
      <div className="editorial-daily-ritual__shell">
        <p className="editorial-section__kicker salon-reveal__item">{EDITORIAL_DAILY_CARDS.kicker}</p>
        <h2
          id="editorial-daily-cards-title"
          className="editorial-section__title salon-reveal__item"
          style={{ ["--salon-i" as string]: 0 }}
        >
          {title}
        </h2>
        <p
          className="editorial-section__subtitle editorial-daily-ritual__subtitle salon-reveal__item"
          style={{ ["--salon-i" as string]: 1 }}
        >
          {subtitle}
        </p>

        {!isLoggedIn || dailyState === "available" ? (
          <ul
            className="editorial-daily-ritual__benefits salon-reveal__item"
            style={{ ["--salon-i" as string]: 2 }}
          >
            {EDITORIAL_DAILY_CARDS.benefits.map((item) => (
              <li key={item.title} className="editorial-daily-ritual__benefit">
                <span className="editorial-daily-ritual__benefit-mark" aria-hidden />
                <span className="editorial-daily-ritual__benefit-title">{item.title}</span>
                <span className="editorial-daily-ritual__benefit-text">{item.text}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="editorial-daily-ritual__actions salon-reveal__item" style={{ ["--salon-i" as string]: 3 }}>
          {showAuthCta ? (
            <button
              type="button"
              className="editorial-btn editorial-btn--gold editorial-daily-ritual__cta"
              onClick={onClick}
              disabled={isLoggedIn && dailyState === "loading"}
              aria-busy={isLoggedIn && dailyState === "loading" ? true : undefined}
            >
              {ctaLabel}
            </button>
          ) : (
            <p className="text-sm text-white/55">{EDITORIAL_DAILY_CARDS.authLoadingLabel}</p>
          )}
          {microcopy ? <p className="editorial-daily-ritual__micro">{microcopy}</p> : null}
        </div>
      </div>
    </section>
  );
}

void EDITORIAL_SECTION_IDS;
