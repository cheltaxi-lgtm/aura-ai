"use client";

import { useEffect, useRef, useState } from "react";

type LandingFinalCtaSectionProps = {
  onOpenCards: () => void;
};

export default function LandingFinalCtaSection({ onOpenCards }: LandingFinalCtaSectionProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const node = ref.current;
    if (reduce.matches || !node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className={`landing-final-cta aura-landing-section--final scroll-mt-24${
        inView ? " landing-final-cta--in" : ""
      }`}
      aria-labelledby="landing-final-cta-title"
    >
      <h2 id="landing-final-cta-title" className="landing-final-cta__title">
        Вопрос уже сформулирован —{" "}
        <span className="landing-final-cta__title-keep">осталось открыть карты</span>
      </h2>
      <p className="landing-final-cta__sub">Три карты бесплатно. Дальше решаете вы.</p>
      <button type="button" className="editorial-btn editorial-btn--gold" onClick={onOpenCards}>
        Открыть 3 карты
      </button>
    </section>
  );
}
