"use client";

import EditorialImage from "@/components/editorial/EditorialImage";
import HeroQuestionField from "@/components/seo/HeroQuestionField";

type LoggedInHomeBannerProps = {
  userName?: string | null;
  onQuestionSubmit?: (question: string) => void;
};

/**
 * Same editorial-hero shell as the guest landing (media + dissolve + overlay),
 * so the candle photo and starfield read as one canvas. Only the copy differs.
 */
export default function LoggedInHomeBanner({
  userName,
  onQuestionSubmit,
}: LoggedInHomeBannerProps) {
  const greeting = userName?.trim()
    ? `С возвращением, ${userName.trim().split(/\s+/)[0]}`
    : "С возвращением";

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
          {greeting}
        </h2>
        <p className="editorial-hero__subtitle">
          Сформулируйте вопрос — подберём мастера и расклад, или продолжите с выбранным проводником.
        </p>
        {onQuestionSubmit ? (
          <HeroQuestionField
            className="mt-6 mx-auto max-w-md"
            onQuestionSubmit={onQuestionSubmit}
          />
        ) : null}
      </div>
    </section>
  );
}
