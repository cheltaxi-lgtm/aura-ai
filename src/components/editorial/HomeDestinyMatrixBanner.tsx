"use client";

import Link from "next/link";
import { Hexagon } from "lucide-react";
import { PRICING } from "@/lib/config/pricing";

const MATRIX_HREF = "/numerology/destiny-matrix";
const FULL_SESSION_HREF = "/?numerolog=1&tool=destiny_matrix";

type HomeDestinyMatrixBannerProps = {
  /** Logged-in users get a secondary CTA into Эвелина session. */
  isLoggedIn?: boolean;
};

/** Homepage promo — matrix is the lightest product entry (date → free preview). */
export default function HomeDestinyMatrixBanner({
  isLoggedIn = false,
}: HomeDestinyMatrixBannerProps) {
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
            Полный AI-разбор с Эвелиной — от {PRICING.NUMEROLOGY_SESSION} ᚢ
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Link
            href={MATRIX_HREF}
            className="btn-luxe btn-luxe--md btn-luxe--gold ritual-cta-banner__btn inline-flex justify-center"
          >
            Рассчитать бесплатно
          </Link>
          {isLoggedIn ? (
            <Link
              href={FULL_SESSION_HREF}
              className="btn-luxe btn-luxe--md btn-luxe--ghost ritual-cta-banner__btn inline-flex justify-center"
            >
              С Эвелиной
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
