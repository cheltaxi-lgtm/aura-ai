"use client";

type LandingFinalCtaSectionProps = {
  onOpenCards: () => void;
};

export default function LandingFinalCtaSection({ onOpenCards }: LandingFinalCtaSectionProps) {
  return (
    <section className="landing-final-cta aura-landing-section--final scroll-mt-24" aria-labelledby="landing-final-cta-title">
      <div className="editorial-landing__inner landing-final-cta__inner">
        <h2 id="landing-final-cta-title" className="landing-final-cta__title">
          Вопрос уже сформулирован — осталось открыть карты
        </h2>
        <p className="landing-final-cta__sub">Три карты бесплатно. Дальше решаете вы.</p>
        <button type="button" className="editorial-btn editorial-btn--gold" onClick={onOpenCards}>
          Открыть 3 карты
        </button>
      </div>
    </section>
  );
}
