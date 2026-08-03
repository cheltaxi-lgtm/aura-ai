"use client";

import EditorialImage from "@/components/editorial/EditorialImage";
import HeroQuestionField from "@/components/seo/HeroQuestionField";
import { useMatrixOwnership } from "@/hooks/useMatrixOwnership";

type LoggedInHomeBannerProps = {
  userName?: string | null;
  onQuestionSubmit?: (question: string) => void;
  onOpenDestinyMatrix?: () => void;
  onOpenDestinyMatrixSession?: () => void;
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
}: LoggedInHomeBannerProps) {
  const { owned: matrixOwned } = useMatrixOwnership({ enabled: true });
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
          Задайте вопрос или продолжите с мастером, с которым уже говорили.
        </p>
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
