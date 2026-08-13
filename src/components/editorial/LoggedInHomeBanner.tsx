"use client";

import { useEffect, useRef } from "react";
import DailyCardsReminderToggle from "@/components/editorial/DailyCardsReminderToggle";
import EditorialImage from "@/components/editorial/EditorialImage";
import type { DailyCardsUiState } from "@/lib/daily-cards-ui";
import { EDITORIAL_DAILY_CARDS } from "@/lib/editorial-landing-content";
import {
  trackDailyCardsCtaClick,
  trackDailyCardsOfferView,
  trackDailyCardsReturnView,
} from "@/lib/seo/metrika";

type LoggedInHomeBannerProps = {
  userName?: string | null;
  dailyCardsState?: DailyCardsUiState;
  dailyCooldownHint?: string | null;
  onOpenDailyCards?: () => void;
  onViewTodayDailyCards?: () => void;
  onPickRegularSpread?: () => void;
};

export default function LoggedInHomeBanner({
  userName,
  dailyCardsState,
  dailyCooldownHint,
  onOpenDailyCards,
  onViewTodayDailyCards,
  onPickRegularSpread,
}: LoggedInHomeBannerProps) {
  const greetingName = userName?.trim().replace(/\s+/g, " ").split(/\s+/)[0] || "";
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    if (!dailyCardsState || dailyCardsState === "loading") return;
    viewed.current = true;
    if (dailyCardsState === "available") trackDailyCardsOfferView("personal_zovus");
    else trackDailyCardsReturnView("personal_zovus");
  }, [dailyCardsState]);

  const dailyTitle =
    dailyCardsState === "loading"
      ? EDITORIAL_DAILY_CARDS.authLoadingLabel
      : dailyCardsState === "available"
        ? EDITORIAL_DAILY_CARDS.authAvailableTitle
        : dailyCardsState === "opened"
          ? EDITORIAL_DAILY_CARDS.authOpenedTitle
          : dailyCardsState === "cooldown"
            ? EDITORIAL_DAILY_CARDS.authCooldownTitle
            : null;

  const dailyHint =
    dailyCardsState === "loading"
      ? "Главное, ресурс и осторожность — на сегодня."
      : dailyCardsState === "available"
        ? EDITORIAL_DAILY_CARDS.authAvailableSubtitle
        : dailyCardsState === "opened"
          ? EDITORIAL_DAILY_CARDS.authOpenedSubtitle
          : dailyCardsState === "cooldown"
            ? dailyCooldownHint?.trim() || EDITORIAL_DAILY_CARDS.authCooldownSubtitle
            : null;

  return (
    <section
      className="editorial-hero editorial-hero--logged-in"
      aria-labelledby="logged-in-home-banner-title"
    >
      <div className="editorial-hero__media" aria-hidden>
        <EditorialImage
          src="/landing/hero.jpg"
          alt=""
          priority
          className="editorial-hero__img"
        />
        <div className="editorial-hero__overlay" />
      </div>
      <div className="editorial-hero__content">
        <div>
          <p className="editorial-hero__eyebrow">Ваше пространство</p>
          <h2 id="logged-in-home-banner-title" className="editorial-hero__title">
            {greetingName ? (
              <>
                С возвращением,
                <span className="editorial-hero__title-name">{greetingName}</span>
              </>
            ) : (
              "С возвращением"
            )}
          </h2>
          <p className="editorial-hero__subtitle">
            Расклады, расчёты и мастера — без лишнего шума.
          </p>
        </div>

        {dailyTitle ? (
          <div className="auth-atelier-today" aria-labelledby="auth-atelier-today-title">
            <p className="auth-atelier-today__kicker">Сегодня</p>
            <p id="auth-atelier-today-title" className="auth-atelier-today__title">
              {dailyTitle}
            </p>
            {dailyHint ? <p className="auth-atelier-today__hint">{dailyHint}</p> : null}
            {dailyCardsState === "available" && onOpenDailyCards ? (
              <button
                type="button"
                className="auth-atelier-today__cta"
                onClick={() => {
                  trackDailyCardsCtaClick("personal_zovus_available");
                  onOpenDailyCards();
                }}
              >
                {EDITORIAL_DAILY_CARDS.authAvailableCta}
              </button>
            ) : null}
            {dailyCardsState === "opened" && onViewTodayDailyCards ? (
              <button
                type="button"
                className="auth-atelier-today__cta"
                onClick={() => {
                  trackDailyCardsCtaClick("personal_zovus_opened");
                  onViewTodayDailyCards();
                }}
              >
                {EDITORIAL_DAILY_CARDS.authOpenedCta}
              </button>
            ) : null}
            {dailyCardsState === "cooldown" && onPickRegularSpread ? (
              <button
                type="button"
                className="auth-atelier-today__cta auth-atelier-today__cta--quiet"
                onClick={() => {
                  trackDailyCardsCtaClick("personal_zovus_cooldown");
                  onPickRegularSpread();
                }}
              >
                {EDITORIAL_DAILY_CARDS.authCooldownCta}
              </button>
            ) : null}
            {dailyCardsState && dailyCardsState !== "loading" ? (
              <DailyCardsReminderToggle />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
