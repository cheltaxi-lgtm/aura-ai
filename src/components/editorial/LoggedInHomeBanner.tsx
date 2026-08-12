"use client";

import { useEffect, useRef } from "react";
import EditorialImage from "@/components/editorial/EditorialImage";
import HeroQuestionField from "@/components/seo/HeroQuestionField";
import { useMatrixOwnership } from "@/hooks/useMatrixOwnership";
import {
  trackDailyCardsCtaClick,
  trackDailyCardsOfferView,
  trackDailyCardsReturnView,
} from "@/lib/seo/metrika";

type LoggedInHomeBannerProps = {
  userName?: string | null;
  onQuestionSubmit?: (question: string) => void;
  onOpenDestinyMatrix?: () => void;
  onOpenDestinyMatrixSession?: () => void;
  /** Rolling 24h authenticated daily triplet. */
  dailyCardsAvailable?: boolean;
  onOpenDailyCards?: () => void;
  onViewTodayDailyCards?: () => void;
};

const chipClass =
  "rounded-full border border-white/15 bg-black/25 px-3.5 py-1.5 text-xs text-white/80 transition hover:border-aura-gold/40 hover:text-aura-gold";

/**
 * Same editorial-hero shell as the guest landing (media + dissolve + overlay),
 * so the candle photo and starfield read as one canvas. Only the copy differs.
 */
export default function LoggedInHomeBanner({
  userName,
  onQuestionSubmit,
  onOpenDestinyMatrix,
  onOpenDestinyMatrixSession,
  dailyCardsAvailable,
  onOpenDailyCards,
  onViewTodayDailyCards,
}: LoggedInHomeBannerProps) {
  const { owned: matrixOwned } = useMatrixOwnership({ enabled: true });
  const greetingName = userName?.trim().replace(/\s+/g, " ").split(/\s+/)[0] || "";
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    if (dailyCardsAvailable === undefined) return;
    viewed.current = true;
    if (dailyCardsAvailable) trackDailyCardsOfferView("logged_in_home");
    else trackDailyCardsReturnView("logged_in_home");
  }, [dailyCardsAvailable]);

  const dailyReady = dailyCardsAvailable !== false;
  const dailyCtaLabel = dailyReady ? "Открыть карты дня" : "Посмотреть сегодняшний расклад";
  const dailyTitle = dailyReady ? "Ваши 3 карты дня готовы" : "Карты дня уже открыты";

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
          Задайте вопрос или продолжите с мастером, с которым уже говорили.
        </p>

        {dailyCardsAvailable !== undefined && (onOpenDailyCards || onViewTodayDailyCards) ? (
          <div className="editorial-hero__daily mt-5 mx-auto max-w-md rounded-xl border border-aura-gold/25 bg-black/30 px-4 py-3 text-left">
            <p className="font-display text-base text-white">{dailyTitle}</p>
            <p className="mt-1 text-xs text-white/55">
              {dailyReady
                ? "Бесплатно раз в сутки — короткий ориентир на сегодня."
                : "Новый бесплатный расклад будет доступен через сутки."}
            </p>
            <button
              type="button"
              className="editorial-btn editorial-btn--gold mt-3 w-full sm:w-auto"
              onClick={() => {
                trackDailyCardsCtaClick(
                  dailyReady ? "logged_in_home_available" : "logged_in_home_used"
                );
                if (dailyReady) onOpenDailyCards?.();
                else onViewTodayDailyCards?.();
              }}
            >
              {dailyCtaLabel}
            </button>
          </div>
        ) : null}

        {onQuestionSubmit ? (
          <HeroQuestionField
            className="mt-6 mx-auto max-w-md"
            onQuestionSubmit={onQuestionSubmit}
          />
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
