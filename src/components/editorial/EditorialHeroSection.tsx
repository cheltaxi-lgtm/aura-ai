"use client";

import Link from "next/link";
import EditorialImage from "@/components/editorial/EditorialImage";
import HeroQuestionField from "@/components/seo/HeroQuestionField";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { BRAND_NAME } from "@/lib/brand";
import { EDITORIAL_HERO } from "@/lib/editorial-landing-content";
import { GUEST_HERO_PAIN_CHIPS } from "@/lib/landing-offer";
import { getSpreadIntentBySlug } from "@/lib/spread-intents/registry";
import { trackQuickQuestionClick } from "@/lib/seo/metrika";
import StarterRunesValue from "@/components/auth/StarterRunesValue";

type EditorialHeroSectionProps = {
  isLoggedIn: boolean;
  pricingLine?: string;
  onPrimaryCta: () => void;
  onSecondaryCta: () => void;
  onQuestionSubmit: (question: string) => void;
  onPainChip?: (question: string, intentSlug: string) => void;
  /** Guest conversion funnel: pain chips + no social-proof counters. */
  conversionHero?: boolean;
};

export default function EditorialHeroSection({
  isLoggedIn,
  pricingLine,
  onPrimaryCta,
  onSecondaryCta,
  onQuestionSubmit,
  onPainChip,
  conversionHero = false,
}: EditorialHeroSectionProps) {
  const { ref, className } = useScrollReveal<HTMLElement>({ immediate: true });

  return (
    <section
      ref={ref}
      className={`editorial-hero ${className}`}
      aria-labelledby="editorial-hero-title"
    >
      <div className="editorial-hero__media">
        <EditorialImage src="/landing/hero.jpg" alt="" priority className="editorial-hero__img" />
        <div className="editorial-hero__overlay" aria-hidden />
      </div>
      <div className="editorial-hero__content">
        <p className="editorial-hero__brand">{BRAND_NAME}</p>
        <h1 id="editorial-hero-title" className="editorial-hero__title">
          {EDITORIAL_HERO.title}
        </h1>
        <p className="editorial-hero__subtitle">{EDITORIAL_HERO.subtitle}</p>
        <HeroQuestionField
          className="editorial-hero__question"
          onQuestionSubmit={onQuestionSubmit}
          autoFocusDesktop={conversionHero && !isLoggedIn}
          submitVariant="secondary"
          placeholder="Например: вернётся ли он?"
          hint="Подберём схему и мастера под ваш вопрос"
          hintOnScrim
        />
        {conversionHero && !isLoggedIn ? (
          <div className="editorial-hero__pain-chips" role="list" aria-label="Частые вопросы">
            {GUEST_HERO_PAIN_CHIPS.map((chip) => {
              const intent = getSpreadIntentBySlug(chip.intentSlug);
              return (
                <button
                  key={chip.label}
                  type="button"
                  role="listitem"
                  className="editorial-hero__pain-chip"
                  onClick={() => {
                    trackQuickQuestionClick(chip.intentSlug);
                    const question = intent?.questionTemplate || chip.label;
                    if (onPainChip) {
                      onPainChip(question, chip.intentSlug);
                      return;
                    }
                    onQuestionSubmit(question);
                  }}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="editorial-hero__actions">
          <button type="button" className="editorial-btn editorial-btn--gold" onClick={onPrimaryCta}>
            {isLoggedIn ? "Продолжить практику" : EDITORIAL_HERO.primaryCta}
          </button>
          <button type="button" className="editorial-btn editorial-btn--ghost" onClick={onSecondaryCta}>
            {EDITORIAL_HERO.secondaryCta}
            <span aria-hidden> →</span>
          </button>
        </div>
        {!isLoggedIn ? (
          <div className="editorial-hero__gift mt-3">
            <StarterRunesValue variant="badge" generic product="home_hero" />
          </div>
        ) : null}
        <p className="editorial-hero__micro">{EDITORIAL_HERO.microcopy}</p>
        {!isLoggedIn ? (
          <p className="editorial-hero__retention-hook">{EDITORIAL_HERO.retentionHook}</p>
        ) : null}
        {pricingLine ? <p className="editorial-hero__pricing">{pricingLine}</p> : null}
        {conversionHero && !isLoggedIn ? (
          <p className="editorial-hero__legal-note">
            18+ ·{" "}
            <Link href="/disclaimer" className="editorial-hero__legal-link">
              развлекательный сервис
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
