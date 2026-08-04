"use client";

import { Sun } from "lucide-react";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

const CALCULATOR_HREF = "/dizayn-cheloveka/rasschitat";

/** Homepage funnel entry for Human Design — free bodygraph, paid Evelina report. */
export default function HomeHumanDesignBanner() {
  const { cost, formatRunes } = useRuneConfig();
  const { humanDesignEnabled, featuresLoaded } = usePlatformFeatures();

  if (!featuresLoaded || !humanDesignEnabled) return null;

  return (
    <section className="ritual-cta-banner" aria-labelledby="home-human-design-title">
      <div className="ritual-cta-banner__inner">
        <span className="ritual-cta-banner__icon" aria-hidden>
          <Sun className="h-6 w-6 text-amber-200" strokeWidth={1.5} />
        </span>
        <div className="ritual-cta-banner__copy">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-amber-400/80">
            Тип, стратегия, авторитет
          </p>
          <h2 id="home-human-design-title" className="ritual-cta-banner__title">
            Дизайн Человека
          </h2>
          <p className="ritual-cta-banner__text">
            Дата, время и город рождения — и на экране ваш бодиграф: 9 центров, каналы
            и ворота. Расчёт бесплатный и точный до угловой секунды.
          </p>
          <p className="mt-1 text-xs text-white/40">
            Бодиграф бесплатно · полный разбор с Эвелиной — {formatRunes(cost("HD_REPORT"))}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <button
            type="button"
            onClick={() => window.location.assign(CALCULATOR_HREF)}
            className="btn-luxe btn-luxe--md btn-luxe--gold ritual-cta-banner__btn"
          >
            Рассчитать бодиграф
          </button>
        </div>
      </div>
    </section>
  );
}
