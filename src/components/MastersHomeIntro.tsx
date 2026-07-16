"use client";

interface MastersHomeIntroProps {
  userName: string;
  hasSpread: boolean;
  readingHint?: string;
}

export default function MastersHomeIntro({
  userName,
  hasSpread,
  readingHint,
}: MastersHomeIntroProps) {
  return (
    <section className="masters-home-intro mx-auto mb-6 max-w-xl text-center">
      <p className="masters-home-intro__eyebrow">Ваше пространство Zovus</p>
      <h1 className="font-display masters-home-intro__title">
        {userName},{" "}
        <span className="lux-heading-accent">
          {hasSpread ? "продолжите путь" : "мастера ждут вас"}
        </span>
      </h1>
      <p className="masters-home-intro__lead">
        {hasSpread
          ? "Расклад готов — выберите наставника для расшифровки или начните новый сеанс."
          : "Бесплатный расклад из 3 карт раз в сутки · колода каждого мастера · чат и расшифровка в рунах ᚢ"}
      </p>
      {readingHint ? (
        <p className="masters-home-intro__hint">{readingHint}</p>
      ) : null}
    </section>
  );
}
