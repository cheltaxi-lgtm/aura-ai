"use client";

import Link from "next/link";
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
import RuneIcon, { RuneAmount } from "@/components/RuneIcon";

const SERVICES = [
  { href: "/numerology/destiny-matrix", label: "Матрица судьбы" },
  { href: "/rasklady", label: "Расклады Таро" },
  { href: "/natalnaya-karta", label: "Натальная карта" },
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
    href: "/natalnaya-karta",
    title: "Натальная карта",
    text: "Западная карта, джйотиш и личные периоды — расчёт по дате рождения с опорой на ваши данные.",
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
    text: "Числа пути, квадрат Пифагора, совместимость и циклы — расчёт у Эвелины, не случайный набор чисел.",
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
    title: "Персональные обряды",
    text: "Практики на опору, защиту и ясность — с лунным календарём и карточкой в кабинете.",
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

type LandingSeoHubProps = {
  rubPerRune?: number;
  readingPriceLabel?: string;
  /** Prefer numeric cost + RuneIcon (avoids tofu for ᚢ). */
  readingCost?: number;
  /** Compact link row instead of large service cards (default). */
  compact?: boolean;
  /** When FAQ lives in a dedicated landing section. */
  hideFaq?: boolean;
};

export default function LandingSeoHub({
  rubPerRune = 2,
  readingPriceLabel,
  readingCost,
  compact = true,
  hideFaq = false,
}: LandingSeoHubProps) {
  const priceNode =
    typeof readingCost === "number" ? (
      <strong className="text-aura-champagne/90 inline-flex items-baseline gap-1">
        <RuneAmount amount={readingCost} />
        {rubPerRune > 0 ? (
          <span className="text-aura-ivory/55 font-normal"> · ~{readingCost * rubPerRune} ₽</span>
        ) : null}
      </strong>
    ) : readingPriceLabel ? (
      <strong className="text-aura-champagne/90">{readingPriceLabel}</strong>
    ) : null;
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
            Выберите тему, откройте символы и получите разбор в чате с наставником в образе
            выбранной традиции.
          </p>
        </header>

        {compact ? (
          <nav className="landing-seo-hub__link-row" aria-label="Разделы сервиса">
            {SERVICES.map(({ href, label }) => (
              <Link key={href} href={href} className="landing-seo-hub__link">
                {label}
              </Link>
            ))}
          </nav>
        ) : (
          <ul className="landing-seo-hub__grid">
            {SERVICE_DETAILS.map(({ href, title, text, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="landing-seo-hub__card group">
                  <span className="landing-seo-hub__card-icon" aria-hidden>
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="landing-seo-hub__card-title">{title}</h3>
                  <p className="landing-seo-hub__card-text">{text}</p>
                  <span className="landing-seo-hub__card-link">Подробнее →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {!hideFaq ? (
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
        ) : null}

        <p className="landing-seo-hub__pricing-note">
          {priceNode ? (
            <>
              Полная расшифровка расклада — {priceNode}
              {rubPerRune > 0 ? (
                <span className="text-aura-ivory/55">
                  {" "}
                  · курс 1 <RuneIcon className="inline-block h-[0.9em] w-[0.6em] align-[-0.1em]" /> ={" "}
                  {rubPerRune} ₽
                </span>
              ) : null}
              . Подробный прайс — в{" "}
              <Link href="/#тарифы" className="landing-seo-hub__inline-link">
                разделе тарифов
              </Link>
              .
            </>
          ) : (
            <>
              Полный прайс в рунах и курс к рублю — в{" "}
              <Link href="/#тарифы" className="landing-seo-hub__inline-link">
                разделе тарифов
              </Link>
              .
            </>
          )}
        </p>
      </div>
    </section>
  );
}
