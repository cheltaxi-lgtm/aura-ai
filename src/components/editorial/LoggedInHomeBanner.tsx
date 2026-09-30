"use client";

import EditorialImage from "@/components/editorial/EditorialImage";
import type { DailyCardsUiState } from "@/lib/daily-cards-ui";
import { trackDailyCardsCtaClick } from "@/lib/seo/metrika";

type LoggedInHomeBannerProps = {
  userName?: string | null;
  dailyCardsState?: DailyCardsUiState;
  onOpenDailyCards?: () => void;
};

export default function LoggedInHomeBanner({
  userName,
  dailyCardsState,
  onOpenDailyCards,
}: LoggedInHomeBannerProps) {
  const greetingName = userName?.trim().replace(/\s+/g, " ").split(/\s+/)[0] || "";

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
          Начните день с бесплатного расклада на утро, день и вечер.
        </p>
        {onOpenDailyCards && dailyCardsState !== "cooldown" ? (
          <button
            type="button"
            className="editorial-hero__daily-cta"
            onClick={() => {
              trackDailyCardsCtaClick("auth_hero");
              onOpenDailyCards();
            }}
          >
            {dailyCardsState === "opened" ? "Посмотреть расклад на сутки" : "Открыть бесплатно · расклад на сутки"}
          </button>
        ) : dailyCardsState === "cooldown" ? (
          <p className="editorial-hero__daily-status">Новый бесплатный расклад завтра</p>
        ) : null}
      </div>
    </section>
  );
}
