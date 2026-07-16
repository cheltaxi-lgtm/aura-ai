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
    text: "Дата рождения — схема с ключевыми энергиями. Расчёт бесплатный; полный разбор — с Эвелиной.",
    icon: Sparkles,
  },
  {
    href: "/rasklady",
    title: "Расклады Таро",
    text: "Готовые вопросы и схемы — от трёх карт до глубоких раскладов. Разбор символов в диалоге.",
    icon: Heart,
  },
  {
    href: "/cabinet/astrology",
    title: "Натальная карта",
    text: "Западная карта, джйотиш и личные периоды — в кабинете, с опорой на ваши данные.",
    icon: Stars,
  },
  {
    href: "/photo-rasklad",
    title: "Фото-расклад",
    text: "Загрузите фото своих карт — распознаем расклад и разберём позиции с выбранным мастером.",
    icon: Camera,
  },
  {
    href: "/numerology",
    title: "Нумерология",
    text: "Числа пути, квадрат Пифагора, совместимость и циклы — расчёт у Эвелины, не случайный draw.",
    icon: Sparkles,
  },
  {
    href: "/cards",
    title: "Значения карт Таро",
    text: "Справочник 78 арканов: прямое и перевёрнутое положение — до и после сеанса.",
    icon: BookOpen,
  },
  {
    href: "/obryady",
    title: "Славянские обряды",
    text: "Практики на опору, защиту и ясность — с лунным календарём и сопровождением в чате.",
    icon: Moon,
  },
  {
    href: "/lenormand",
    title: "Ленорман",
    text: "Короткая линия карт — прямой ответ на связь, сроки и решение.",
    icon: Rows3,
  },
  {
    href: "/joint-reading",
    title: "Совместимость пары",
    text: "Расклад или числа для двоих: динамика связи и точки роста.",
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
          <p className="landing-seo-hub__eyebrow">Разделы и тарифы</p>
          <h2 id="landing-seo-hub-title" className="aura-landing-section__title">
            Карты, числа и астрология в одном пространстве
          </h2>
          <p className="aura-landing-section__subtitle">
            Выберите тему, откройте символы и получите разбор в чате с ИИ-наставником в образе
            выбранной традиции.
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
