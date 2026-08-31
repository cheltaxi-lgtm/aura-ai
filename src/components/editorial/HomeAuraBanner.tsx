"use client";

import Link from "next/link";

import { useRuneConfig } from "@/lib/useRuneConfig";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import { trackProductFunnel } from "@/lib/seo/product-funnel";

/**
 * «Новинка» home banner for Aura by photo — guest and logged-in landings.
 * Self-gated by the aura kill-switch (renders nothing while disabled).
 */
export default function HomeAuraBanner() {
  const { cost, formatRunes } = useRuneConfig();
  const { auraReadingEnabled, featuresLoaded } = usePlatformFeatures();

  if (!featuresLoaded || !auraReadingEnabled) return null;

  return (
    <section
      className="ritual-cta-banner aura-promo-banner"
      aria-labelledby="home-aura-banner-title"
    >
      <div className="ritual-cta-banner__inner">
        <span className="aura-promo-banner__orb" aria-hidden>
          <span className="aura-promo-banner__orb-glow" />
          <span className="aura-promo-banner__orb-core" />
        </span>
        <div className="ritual-cta-banner__copy">
          <p className="aura-promo-banner__badge-row">
            <span className="aura-promo-banner__badge">Новинка</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-amber-400/80">
              7 слоёв поля · чакры · цветовая карта
            </span>
          </p>
          <h2 id="home-aura-banner-title" className="ritual-cta-banner__title">
            Ваша аура по фото
          </h2>
          <p className="ritual-cta-banner__text">
            Камера видит лицо — мастер читает поле: доминирующий цвет, состояние чакр
            и цветовую карту вашей ауры. Снимок за полминуты, фото не сохраняется.
          </p>
          <p className="mt-1 text-xs text-white/40">
            Снимок бесплатно · первый разбор — половина цены (полная стоимость{" "}
            {formatRunes(cost("AURA_READING"))})
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <Link
            href="/aura"
            onClick={() =>
              trackProductFunnel("product_view", { product: "aura", source: "home_banner" })
            }
            className="btn-luxe btn-luxe--md btn-luxe--gold ritual-cta-banner__btn"
          >
            Увидеть свою ауру
          </Link>
        </div>
      </div>
    </section>
  );
}
