"use client";

type LandingDemoSectionProps = {
  onOpenCards: () => void;
};

export default function LandingDemoSection({ onOpenCards }: LandingDemoSectionProps) {
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

        <ol className="landing-demo__cards">
          <li>
            <span className="landing-demo__pos">Позиция 1 — Что происходит</span>
            <strong>Восьмёрка Кубков</strong>
          </li>
          <li>
            <span className="landing-demo__pos">Позиция 2 — Что скрыто</span>
            <strong>Луна</strong>
          </li>
          <li>
            <span className="landing-demo__pos">Позиция 3 — К чему ведёт</span>
            <strong>Двойка Жезлов</strong>
          </li>
        </ol>

        <div className="landing-demo__teaser">
          <p>
            Восьмёрка Кубков в первой позиции — не ссора и не обрыв. Это тихий уход: человек отходит от
            того, что перестал понимать, и обычно не объясняет причину, потому что не сформулировал её и
            для себя.
          </p>
          <p>
            Луна в центре — самая честная карта этого расклада. Она говорит, что фактов у вас сейчас
            меньше, чем версий. Три дня молчания вы уже дополнили целой историей, и разбирать нужно в
            первую очередь её, а не его.
          </p>
          <p>
            Двойка Жезлов в исходе — точка выбора. И принадлежит она вам, а не ему.
          </p>
        </div>

        <div className="landing-demo__curtain">
          <p className="landing-demo__full-peek">
            Разберём подробно. Восьмёрка Кубков говорит о том, куда именно он ушёл и что должно
            произойти, чтобы он вернулся своим ходом…
          </p>
          <div className="landing-demo__curtain-panel">
            <p className="landing-demo__curtain-label">Полный разбор — после входа</p>
            <button type="button" className="editorial-btn editorial-btn--gold" onClick={onOpenCards}>
              Открыть свои 3 карты
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
