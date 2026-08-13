"use client";

import { useEffect, useRef } from "react";
import DailyCardsReminderToggle from "@/components/editorial/DailyCardsReminderToggle";
import EditorialImage from "@/components/editorial/EditorialImage";
import { useMatrixOwnership } from "@/hooks/useMatrixOwnership";
import type { DailyCardsUiState } from "@/lib/daily-cards-ui";
import { EDITORIAL_DAILY_CARDS } from "@/lib/editorial-landing-content";
import {
  trackDailyCardsCtaClick,
  trackDailyCardsOfferView,
  trackDailyCardsReturnView,
} from "@/lib/seo/metrika";

type LoggedInHomeBannerProps = {
  userName?: string | null;
  onOpenDestinyMatrix?: () => void;
  onOpenDestinyMatrixSession?: () => void;
  dailyCardsState?: DailyCardsUiState;
  dailyCooldownHint?: string | null;
  onOpenDailyCards?: () => void;
  onViewTodayDailyCards?: () => void;
  onPickRegularSpread?: () => void;
};

const chipClass =
  "rounded-full border border-white/15 bg-black/25 px-3.5 py-1.5 text-xs text-white/80 transition hover:border-aura-gold/40 hover:text-aura-gold";

export default function LoggedInHomeBanner({
  userName,
  onOpenDestinyMatrix,
  onOpenDestinyMatrixSession,
  dailyCardsState,
  dailyCooldownHint,
  onOpenDailyCards,
  onViewTodayDailyCards,
  onPickRegularSpread,
}: LoggedInHomeBannerProps) {
  const { owned: matrixOwned } = useMatrixOwnership({ enabled: true });
  const greetingName = userName?.trim().replace(/\s+/g, " ").split(/\s+/)[0] || "";
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    if (!dailyCardsState || dailyCardsState === "loading") return;
    viewed.current = true;
    if (dailyCardsState === "available") trackDailyCardsOfferView("logged_in_home");
    else trackDailyCardsReturnView("logged_in_home");
  }, [dailyCardsState]);

  const showDaily = Boolean(dailyCardsState && (onOpenDailyCards || onViewTodayDailyCards || onPickRegularSpread));

  const dailyTitle =
    dailyCardsState === "loading"
      ? EDITORIAL_DAILY_CARDS.authLoadingLabel
      : dailyCardsState === "available"
        ? EDITORIAL_DAILY_CARDS.authAvailableTitle
        : dailyCardsState === "opened"
          ? EDITORIAL_DAILY_CARDS.authOpenedTitle
          : EDITORIAL_DAILY_CARDS.authCooldownTitle;

  const dailyHint =
    dailyCardsState === "loading"
      ? "Готовим карты дня…"
      : dailyCardsState === "available"
        ? EDITORIAL_DAILY_CARDS.authAvailableSubtitle
        : dailyCardsState === "opened"
          ? EDITORIAL_DAILY_CARDS.authOpenedSubtitle
          : dailyCooldownHint?.trim() || EDITORIAL_DAILY_CARDS.authCooldownSubtitle;

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
        <p className="editorial-hero__eyebrow">Ваше пространство</p>
        <h2 id="logged-in-home-banner-title" className="editorial-hero__title">
          {greetingName ? (
            <>
              С возвращением,{" "}
              <span className="editorial-hero__title-name">{greetingName}</span>
            </>
          ) : (
            "С возвращением"
          )}
        </h2>
        <p className="editorial-hero__subtitle">
          Откройте 3 карты дня — главное, ресурс и где сегодня лучше не спешить.
        </p>

        {showDaily ? (
          <div className="editorial-hero__daily mt-5 mx-auto max-w-md rounded-xl border border-aura-gold/25 bg-black/30 px-4 py-4 text-left min-h-[7.5rem]">
            <p className="font-display text-base text-white">{dailyTitle}</p>
            <p className="mt-1 text-xs text-white/55">{dailyHint}</p>
            {dailyCardsState === "available" ? (
              <button
                type="button"
                className="editorial-btn editorial-btn--gold mt-4 w-full"
                onClick={() => {
                  trackDailyCardsCtaClick("logged_in_home_available");
                  onOpenDailyCards?.();
                }}
              >
                {EDITORIAL_DAILY_CARDS.authAvailableCta}
              </button>
            ) : null}
            {dailyCardsState === "opened" ? (
              <button
                type="button"
                className="editorial-btn editorial-btn--gold mt-4 w-full"
                onClick={() => {
                  trackDailyCardsCtaClick("logged_in_home_opened");
                  onViewTodayDailyCards?.();
                }}
              >
                {EDITORIAL_DAILY_CARDS.authOpenedCta}
              </button>
            ) : null}
            {dailyCardsState === "cooldown" && onPickRegularSpread ? (
              <button
                type="button"
                className="editorial-btn editorial-btn--ghost mt-4 w-full"
                onClick={() => {
                  trackDailyCardsCtaClick("logged_in_home_cooldown");
                  onPickRegularSpread();
                }}
              >
                {EDITORIAL_DAILY_CARDS.authCooldownCta}
              </button>
            ) : null}
            {dailyCardsState === "loading" ? (
              <button
                type="button"
                className="editorial-btn editorial-btn--gold mt-4 w-full"
                disabled
                aria-busy="true"
              >
                {EDITORIAL_DAILY_CARDS.authLoadingLabel}
              </button>
            ) : null}
            <DailyCardsReminderToggle />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className={chipClass}
            onClick={() => {
              if (onOpenDestinyMatrix) onOpenDestinyMatrix();
              else window.location.assign("/numerology/destiny-matrix");
            }}
          >
            Матрица судьбы
          </button>
          <button
            type="button"
            className={chipClass}
            onClick={() => {
              if (onOpenDestinyMatrixSession) onOpenDestinyMatrixSession();
              else window.location.assign("/?numerolog=1&tool=destiny_matrix");
            }}
          >
            {matrixOwned ? "Мой разбор с Эвелиной" : "С Эвелиной"}
          </button>
          <button
            type="button"
            className={chipClass}
            onClick={() => window.location.assign("/cabinet/astrology")}
          >
            Натальная карта
          </button>
        </div>
      </div>
    </section>
  );
}
