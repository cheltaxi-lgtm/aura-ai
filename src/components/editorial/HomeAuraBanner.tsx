"use client";

import Link from "next/link";
import { ArrowUpRight, Hand } from "lucide-react";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import { trackProductFunnel } from "@/lib/seo/product-funnel";

/** Shared home promotion; each direction respects its own availability switch. */
export default function HomeAuraBanner() {
  const { cost, formatRunes } = useRuneConfig();
  const { auraReadingEnabled, palmReadingEnabled, featuresLoaded } = usePlatformFeatures();
  if (!featuresLoaded || (!auraReadingEnabled && !palmReadingEnabled)) return null;

  return (
    <section className="ritual-cta-banner aura-promo-banner" aria-labelledby="home-aura-banner-title">
      <div className="aura-promo-banner__panel">
        <header className="aura-promo-banner__intro">
          <span className="aura-promo-banner__badge">
            {auraReadingEnabled && palmReadingEnabled ? "Две новинки" : "Новинка"}
          </span>
          <h2 id="home-aura-banner-title">Откройте себя с новой стороны</h2>
          <p>Одно фото — новый взгляд на себя. Выберите, с чего начать.</p>
        </header>
        <div className="aura-promo-banner__grid">
          {auraReadingEnabled && (
            <article className="aura-promo-banner__card aura-promo-banner__card--aura">
              <div className="aura-promo-banner__card-top">
                <span className="aura-promo-banner__orb" aria-hidden="true">
                  <span className="aura-promo-banner__orb-glow" />
                  <span className="aura-promo-banner__orb-core" />
                </span>
                <span className="aura-promo-banner__eyebrow">Ваш портрет в цвете</span>
              </div>
              <h3>Аура по фото</h3>
              <p className="aura-promo-banner__description">Какие цвета расскажут вашу историю? Получите символический портрет ауры и откройте темы для размышления о себе.</p>
              <p className="aura-promo-banner__offer">Снимок ауры — бесплатно</p>
              <p className="aura-promo-banner__details">Первый разбор — за половину цены. Полная стоимость: {formatRunes(cost("AURA_READING"))}.</p>
              <Link href="/aura" prefetch={false} className="btn-luxe btn-luxe--md btn-luxe--gold aura-promo-banner__link"
                onClick={() => trackProductFunnel("product_view", { product: "aura", source: "home_banner" })}>
                Увидеть свою ауру <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </article>
          )}
          {palmReadingEnabled && (
            <article className="aura-promo-banner__card aura-promo-banner__card--palm">
              <div className="aura-promo-banner__card-top">
                <span className="aura-promo-banner__hand" aria-hidden="true"><Hand size={34} strokeWidth={1.2} /></span>
                <span className="aura-promo-banner__eyebrow">Ваша история в линиях</span>
              </div>
              <h3>Гадание по ладони</h3>
              <p className="aura-promo-banner__description">О чём говорят линии вашей руки? Исследуйте характер, отношения и сильные стороны через символику хиромантии.</p>
              <p className="aura-promo-banner__offer">Снимок ладони и краткий результат — бесплатно</p>
              <p className="aura-promo-banner__details">Сначала познакомьтесь с результатом. Полный разбор можно открыть отдельно.</p>
              <Link href="/gadanie-po-ladoni" prefetch={false} className="btn-luxe btn-luxe--md btn-luxe--gold aura-promo-banner__link"
                onClick={() => trackProductFunnel("product_view", { product: "palm", source: "home_banner" })}>
                Прочитать свою ладонь <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
