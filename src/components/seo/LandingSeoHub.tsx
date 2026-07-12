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
  {
    href: "/rasklady",
    title: "Расклады Таро онлайн",
    text: "Любовь, отношения, работа и судьба — готовые схемы от одной карты до Кельтского креста. Мастер расшифрует выпавшие символы в диалоге.",
    icon: Heart,
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

export default function LandingSeoHub() {
  return (
    <section
      id="тарифы"
      className="landing-seo-hub aura-landing-section relative z-[1]"
      aria-labelledby="landing-seo-hub-title"
    >
      <div className="mx-auto max-w-6xl">
        <header className="aura-landing-section__head landing-seo-hub__head">
          <p className="landing-seo-hub__eyebrow">Справочник и направления</p>
          <h2 id="landing-seo-hub-title" className="aura-landing-section__title">
            Таро, руны, астрология и нумерология онлайн
          </h2>
          <p className="aura-landing-section__subtitle">
            Zovus — сервис персональных раскладов и расчётов с ИИ-мастерами. Выберите тему,
            откройте символы и получите расшифровку в чате — без звонков и очередей.
          </p>
        </header>

        <ul className="landing-seo-hub__grid">
          {SERVICES.map(({ href, title, text, icon: Icon }) => (
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
          Полный прайс в рунах и курс к рублю — кнопка{" "}
          <strong className="text-aura-champagne/90">«Тарифы»</strong> в верхнем меню.
        </p>
      </div>
    </section>
  );
}
