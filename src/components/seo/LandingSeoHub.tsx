"use client";

import { type MouseEvent } from "react";
import {
  BookOpen,
  Camera,
  Heart,
  Moon,
  Rows3,
  Sparkles,
  Stars,
} from "lucide-react";
import { LANDING_FAQ_ITEMS } from "@/lib/landing-offer";

const SERVICES = [
  { href: "/numerology/destiny-matrix", label: "Матрица судьбы" },
  { href: "/rasklady", label: "Расклады Таро" },
  { href: "/cabinet/astrology", label: "Натальная карта" },
  { href: "/photo-rasklad", label: "Фото-расклад" },
  { href: "/numerology", label: "Нумерология" },
  { href: "/cards", label: "Значения карт" },
  { href: "/obryady", label: "Обряды" },
  { href: "/lenormand", label: "Ленорман" },
  { href: "/joint-reading", label: "Совместимость" },
] as const;

const SERVICE_DETAILS = [
  {
    href: "/numerology/destiny-matrix",
    title: "Матрица судьбы",
    text: "Быстрый расчёт по дате рождения: предназначение, деньги, отношения и аркан года. Базовый результат бесплатно — полный разбор с Эвелиной.",
    icon: Sparkles,
  },
  {
    href: "/rasklady",
    title: "Расклады Таро онлайн",
    text: "Любовь, отношения, работа и судьба — готовые схемы от одной карты до Кельтского креста. Мастер расшифрует выпавшие символы в диалоге.",
    icon: Heart,
  },
  {
    href: "/cabinet/astrology",
    title: "Натальная карта",
    text: "Западная карта, джйотиш, персональные периоды и платные отчёты — в личном астрологическом пространстве с прозрачной методологией.",
    icon: Stars,
  },
  {
    href: "/photo-rasklad",
    title: "Фото-расклад",
    text: "Загрузите фото своих карт — сервис распознает расклад и даст трактовку в стиле выбранного наставника.",
    icon: Camera,
  },
  {
    href: "/numerology",
    title: "Нумерология по дате рождения",
    text: "Число жизненного пути, квадрат Пифагора, совместимость и прогноз — расчёт у нумеролога Эвелины, не «вытягивание» цифр.",
    icon: Sparkles,
  },
  {
    href: "/cards",
    title: "Значения карт Таро",
    text: "Справочник 78 арканов: прямое и перевёрнутое положение, сочетания пар — полезно до и после сеанса.",
    icon: BookOpen,
  },
  {
    href: "/obryady",
    title: "Славянские обряды",
    text: "Ритуалы на привлечение, защиту и изобилие — с лунным календарём и сопровождением мастера в чате.",
    icon: Moon,
  },
  {
    href: "/lenormand",
    title: "Ленорман онлайн",
    text: "Линия из пяти карт — быстрый оракул на любовь, сроки и решения. Прямая трактовка с мастером в чате.",
    icon: Rows3,
  },
  {
    href: "/joint-reading",
    title: "Совместимость пары",
    text: "Расклад и нумерология для двоих: чувства партнёра, перспектива союза, точки роста в отношениях.",
    icon: Stars,
  },
] as const;

const go = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault();
  window.location.assign(href);
};

type LandingSeoHubProps = {
  rubPerRune?: number;
  readingPriceLabel?: string;
  /** Compact link row instead of large service cards (default). */
  compact?: boolean;
};

export default function LandingSeoHub({
  rubPerRune = 2,
  readingPriceLabel,
  compact = true,
}: LandingSeoHubProps) {
  return (
    <section
      id="тарифы"
      className="landing-seo-hub aura-landing-section relative z-[1]"
      aria-labelledby="landing-seo-hub-title"
    >
      <div className="mx-auto max-w-6xl">
        <header className="aura-landing-section__head landing-seo-hub__head">
          <p className="landing-seo-hub__eyebrow">Справочник и тарифы</p>
          <h2 id="landing-seo-hub-title" className="aura-landing-section__title">
            Таро, руны, астрология и нумерология онлайн
          </h2>
          <p className="aura-landing-section__subtitle">
            Zovus — сервис персональных раскладов и расчётов с наставниками в художественных образах.
            Выберите тему, откройте символы и получите расшифровку в чате.
          </p>
        </header>

        {compact ? (
          <nav className="landing-seo-hub__link-row" aria-label="Разделы сервиса">
            {SERVICES.map(({ href, label }) => (
              <a key={href} href={href} onClick={go(href)} className="landing-seo-hub__link">
                {label}
              </a>
            ))}
          </nav>
        ) : (
          <ul className="landing-seo-hub__grid">
            {SERVICE_DETAILS.map(({ href, title, text, icon: Icon }) => (
              <li key={href}>
                <a href={href} onClick={go(href)} className="landing-seo-hub__card group">
                  <span className="landing-seo-hub__card-icon" aria-hidden>
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="landing-seo-hub__card-title">{title}</h3>
                  <p className="landing-seo-hub__card-text">{text}</p>
                  <span className="landing-seo-hub__card-link">Подробнее →</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="landing-seo-hub__faq">
          <h3 className="landing-seo-hub__faq-title">Частые вопросы</h3>
          <div className="landing-seo-hub__faq-list">
            {LANDING_FAQ_ITEMS.map(({ question, answer }) => (
              <details key={question} className="landing-seo-hub__faq-item">
                <summary className="landing-seo-hub__faq-q">{question}</summary>
                <p className="landing-seo-hub__faq-a">{answer}</p>
              </details>
            ))}
          </div>
        </div>

        <p className="landing-seo-hub__pricing-note">
          {readingPriceLabel ? (
            <>
              Полная расшифровка расклада — <strong className="text-aura-champagne/90">{readingPriceLabel}</strong>
              {rubPerRune > 0 ? (
                <span className="text-aura-ivory/55"> · курс 1 ᚢ = {rubPerRune} ₽</span>
              ) : null}
              . Подробный прайс — кнопка{" "}
              <strong className="text-aura-champagne/90">«Тарифы»</strong> в верхнем меню.
            </>
          ) : (
            <>
              Полный прайс в рунах и курс к рублю — кнопка{" "}
              <strong className="text-aura-champagne/90">«Тарифы»</strong> в верхнем меню.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
