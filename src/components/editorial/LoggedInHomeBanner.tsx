"use client";

import EditorialImage from "@/components/editorial/EditorialImage";
import HeroQuestionField from "@/components/seo/HeroQuestionField";

type LoggedInHomeBannerProps = {
  userName?: string | null;
  onQuestionSubmit?: (question: string) => void;
};

/** Top home strip for logged-in users (replaces hidden guest hero). */
export default function LoggedInHomeBanner({
  userName,
  onQuestionSubmit,
}: LoggedInHomeBannerProps) {
  const greeting = userName?.trim() ? `С возвращением, ${userName.trim().split(/\s+/)[0]}` : "С возвращением";

  return (
    <section className="logged-in-home-banner" aria-labelledby="logged-in-home-banner-title">
      <div className="logged-in-home-banner__media" aria-hidden>
        <EditorialImage
          src="/landing/hero.jpg"
          alt=""
          priority
          className="logged-in-home-banner__img"
        />
        <div className="logged-in-home-banner__overlay" />
      </div>
      <div className="logged-in-home-banner__panel">
        <p className="logged-in-home-banner__eyebrow">Ваше пространство</p>
        <h2 id="logged-in-home-banner-title" className="logged-in-home-banner__title">
          {greeting}
        </h2>
        <p className="logged-in-home-banner__subtitle">
          Сформулируйте вопрос — подберём мастера и расклад, или продолжите с выбранным проводником.
        </p>
        {onQuestionSubmit ? (
          <HeroQuestionField className="logged-in-home-banner__search" onQuestionSubmit={onQuestionSubmit} />
        ) : null}
      </div>
    </section>
  );
}
