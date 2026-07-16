"use client";

import { motion } from "framer-motion";
import EditorialImage from "@/components/editorial/EditorialImage";
import HeroQuestionField from "@/components/seo/HeroQuestionField";
import { BRAND_NAME } from "@/lib/brand";
import { EDITORIAL_HERO } from "@/lib/editorial-landing-content";

const motionEase = [0.22, 1, 0.36, 1] as const;

type EditorialHeroSectionProps = {
  isLoggedIn: boolean;
  pricingLine?: string;
  onPrimaryCta: () => void;
  onSecondaryCta: () => void;
  onQuestionSubmit: (question: string) => void;
};

export default function EditorialHeroSection({
  isLoggedIn,
  pricingLine,
  onPrimaryCta,
  onSecondaryCta,
  onQuestionSubmit,
}: EditorialHeroSectionProps) {
  return (
    <section className="editorial-hero" aria-labelledby="editorial-hero-title">
      <div className="editorial-hero__media">
        <EditorialImage src="/landing/hero.jpg" alt="" priority className="editorial-hero__img" />
        <div className="editorial-hero__overlay" aria-hidden />
      </div>
      <motion.div
        className="editorial-hero__content"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: motionEase }}
      >
        <p className="editorial-hero__brand">{BRAND_NAME}</p>
        <h1 id="editorial-hero-title" className="editorial-hero__title">
          {EDITORIAL_HERO.title}
        </h1>
        <p className="editorial-hero__subtitle">{EDITORIAL_HERO.subtitle}</p>
        <HeroQuestionField className="mt-6 max-w-md mx-auto" onQuestionSubmit={onQuestionSubmit} />
        <div className="editorial-hero__actions">
          <button type="button" className="editorial-btn editorial-btn--gold" onClick={onPrimaryCta}>
            {isLoggedIn ? "Продолжить практику" : EDITORIAL_HERO.primaryCta}
          </button>
          <button type="button" className="editorial-btn editorial-btn--ghost" onClick={onSecondaryCta}>
            {EDITORIAL_HERO.secondaryCta}
          </button>
        </div>
        <p className="editorial-hero__micro">{EDITORIAL_HERO.microcopy}</p>
        {pricingLine ? <p className="editorial-hero__pricing">{pricingLine}</p> : null}
      </motion.div>
    </section>
  );
}
