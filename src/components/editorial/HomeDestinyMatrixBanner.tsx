"use client";

import { Hexagon } from "lucide-react";
import { PRICING } from "@/lib/config/pricing";

const MATRIX_HREF = "/numerology/destiny-matrix";
const FULL_SESSION_HREF = "/?numerolog=1&tool=destiny_matrix";

type HomeDestinyMatrixBannerProps = {
  isLoggedIn?: boolean;
  /** Prefer direct session open over URL deep-link when parent can handle it. */
  onOpenWithEvelina?: () => void;
};

/** Homepage promo — matrix is the lightest product entry (date → free preview). */
export default function HomeDestinyMatrixBanner({
  isLoggedIn = false,
  onOpenWithEvelina,
}: HomeDestinyMatrixBannerProps) {
  const openPreview = () => {
    window.location.assign(MATRIX_HREF);
  };

  const openWithEvelina = () => {
    if (onOpenWithEvelina) {
      onOpenWithEvelina();
      return;
    }
    // Full navigation so HomePage deep-link effect re-runs (soft Link to /?… is a no-op).
    window.location.assign(FULL_SESSION_HREF);
  };

  return (
    <section className="ritual-cta-banner" aria-labelledby="home-destiny-matrix-title">
      <div className="ritual-cta-banner__inner">
        <span className="ritual-cta-banner__icon" aria-hidden>
          <Hexagon className="h-6 w-6 text-amber-200" strokeWidth={1.5} />
        </span>
        <div className="ritual-cta-banner__copy">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-amber-400/80">
            Быстрый вход
          </p>
          <h2 id="home-destiny-matrix-title" className="ritual-cta-banner__title">
            Матрица судьбы
          </h2>
          <p className="ritual-cta-banner__text">
            Только дата рождения — схема, предназначение, деньги, отношения и аркан года за минуту.
            Базовый расчёт бесплатно, без анкеты.
          </p>
          <p className="mt-1 text-xs text-white/40">
            Цифры бесплатно · AI-разбор с Эвелиной — {PRICING.NUMEROLOGY_SESSION} ᚢ один раз
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <button
            type="button"
            onClick={openPreview}
            className="btn-luxe btn-luxe--md btn-luxe--gold ritual-cta-banner__btn"
          >
            Рассчитать бесплатно
          </button>
          {isLoggedIn ? (
            <button
              type="button"
              onClick={openWithEvelina}
              className="btn-luxe btn-luxe--md btn-luxe--ghost ritual-cta-banner__btn"
            >
              С Эвелиной
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
