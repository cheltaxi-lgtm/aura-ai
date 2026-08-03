"use client";

import { Hexagon } from "lucide-react";
import { PRICING } from "@/lib/config/pricing";
import { useMatrixOwnership } from "@/hooks/useMatrixOwnership";

const MATRIX_HREF = "/numerology/destiny-matrix";
const FULL_SESSION_HREF = "/?numerolog=1&tool=destiny_matrix";

type HomeDestinyMatrixBannerProps = {
  isLoggedIn?: boolean;
  /** Prefer direct session open over URL deep-link when parent can handle it. */
  onOpenWithEvelina?: () => void;
  /** When Full Matrix is already purchased — open saved report, skip tool picker. */
  onOpenOwnedReport?: () => void;
};

/** Homepage promo — matrix is the lightest product entry (date → free preview). */
export default function HomeDestinyMatrixBanner({
  isLoggedIn = false,
  onOpenWithEvelina,
  onOpenOwnedReport,
}: HomeDestinyMatrixBannerProps) {
  const { owned, loading } = useMatrixOwnership({ enabled: isLoggedIn });

  const openPreview = () => {
    window.location.assign(MATRIX_HREF);
  };

  const openOwned = () => {
    if (onOpenOwnedReport) {
      onOpenOwnedReport();
      return;
    }
    if (onOpenWithEvelina) {
      onOpenWithEvelina();
      return;
    }
    window.location.assign(FULL_SESSION_HREF);
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
            По дате рождения
          </p>
          <h2 id="home-destiny-matrix-title" className="ritual-cta-banner__title">
            Матрица судьбы
          </h2>
          <p className="ritual-cta-banner__text">
            {owned
              ? "Полный разбор с Эвелиной уже открыт — повторно платить не нужно."
              : "Одна дата — и на экране схема с ключевыми энергиями. Расчёт бесплатный, без анкеты и регистрации."}
          </p>
          {!owned ? (
            <p className="mt-1 text-xs text-white/40">
              Схема бесплатно · разбор с Эвелиной — {PRICING.NUMEROLOGY_SESSION} ᚢ один раз
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          {owned ? (
            <button
              type="button"
              onClick={openOwned}
              className="btn-luxe btn-luxe--md btn-luxe--gold ritual-cta-banner__btn"
            >
              Открыть разбор
            </button>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </section>
  );
}
