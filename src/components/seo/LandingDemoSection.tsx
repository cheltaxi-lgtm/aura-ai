"use client";

import { useEffect, useRef, useState } from "react";
import DeckCard from "@/components/DeckCard";
import { TRIPLET_UI_POSITIONS } from "@/lib/decks";

type LandingDemoSectionProps = {
  onOpenCards: () => void;
};

/** Canonical deck names/IDs for art resolution — display names match the prose below. */
const DEMO_CARDS = [
  {
    id: 29,
    name: "8 Кубков",
    displayName: "Восьмёрка Кубков",
    position: TRIPLET_UI_POSITIONS[0],
  },
  {
    id: 18,
    name: "Луна",
    displayName: "Луна",
    position: TRIPLET_UI_POSITIONS[1],
  },
  {
    id: 37,
    name: "2 Жезлов",
    displayName: "Двойка Жезлов",
    position: TRIPLET_UI_POSITIONS[2],
  },
] as const;

/** Byte-stable demo copy — do not edit wording. */
const DEMO_TEASER_P1 =
  "Восьмёрка Кубков в первой позиции — не ссора и не обрыв. Это тихий уход: человек отходит от того, что перестал понимать, и обычно не объясняет причину, потому что не сформулировал её и для себя.";
const DEMO_TEASER_P2 =
  "Луна в центре — самая честная карта этого расклада. Она говорит, что фактов у вас сейчас меньше, чем версий. Три дня молчания вы уже дополнили целой историей, и разбирать нужно в первую очередь её, а не его.";
const DEMO_TEASER_P3 = "Двойка Жезлов в исходе — точка выбора. И принадлежит она вам, а не ему.";
const DEMO_PEEK =
  "Разберём подробно. Восьмёрка Кубков говорит о том, куда именно он ушёл и что должно произойти, чтобы он вернулся своим ходом…";

export default function LandingDemoSection({ onOpenCards }: LandingDemoSectionProps) {
  const readingRef = useRef<HTMLDivElement | null>(null);
  const [shimmerOn, setShimmerOn] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const node = readingRef.current;
    let visible = true;

    const apply = () => {
      setShimmerOn(!reduce.matches && visible);
    };
    apply();

    let io: IntersectionObserver | null = null;
    if (node && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        ([entry]) => {
          visible = Boolean(entry?.isIntersecting);
          apply();
        },
        { threshold: 0.15 }
      );
      io.observe(node);
    }

    const onReduceChange = () => apply();
    reduce.addEventListener("change", onReduceChange);
    return () => {
      io?.disconnect();
      reduce.removeEventListener("change", onReduceChange);
    };
  }, []);

  return (
    <section className="landing-demo scroll-mt-24" aria-labelledby="landing-demo-title">
      <div className="editorial-landing__inner">
        <header className="landing-demo__head">
          <h2 id="landing-demo-title" className="landing-demo__title">
            Так выглядит ответ
          </h2>
          <p className="landing-demo__caption">Пример разбора. Ваши карты будут другими.</p>
        </header>

        <blockquote className="landing-demo__question">
          <p>«Он не пишет третий день. Что происходит?»</p>
        </blockquote>

        <ol className="landing-demo__spread" aria-label="Пример расклада на три карты">
          {DEMO_CARDS.map((card) => (
            <li key={card.id} className="landing-demo__spread-item">
              <p className="landing-demo__pos">{card.position}</p>
              <div className="landing-demo__card-slot">
                <DeckCard
                  card={{ id: card.id, name: card.name, meaning: "" }}
                  system="tarot-veronika"
                  showMeaning={false}
                  hideCaption
                  size="md"
                  className="h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none"
                />
              </div>
              <p className="landing-demo__card-name">{card.displayName}</p>
            </li>
          ))}
        </ol>

        <div
          ref={readingRef}
          className={`landing-demo__reading${
            shimmerOn ? " landing-demo__reading--shimmer" : ""
          }`}
        >
          <div className="landing-demo__teaser">
            <p>{DEMO_TEASER_P1}</p>
            <p>{DEMO_TEASER_P2}</p>
            <p>{DEMO_TEASER_P3}</p>
            <p className="landing-demo__full-peek">{DEMO_PEEK}</p>
          </div>
        </div>

        <div className="landing-demo__cta">
          <p className="landing-demo__cta-label">Полный разбор — после входа</p>
          <button type="button" className="editorial-btn editorial-btn--gold" onClick={onOpenCards}>
            Открыть свои 3 карты
          </button>
        </div>
      </div>
    </section>
  );
}
