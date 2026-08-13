import Link from "next/link";
import HeroQuestionField from "@/components/seo/HeroQuestionField";
import { getFeaturedSpreadIntents, getSpreadIntentBySlug } from "@/lib/spread-intents";

const HOME_INTENT_SLUGS = [
  "chto-mezhdu-nami",
  "chto-so-mnoy-proiskhodit",
  "zhdat-ili-zabyt",
  "budem-li-my-vmeste",
  "stoit-li-menyat-rabotu",
  "kuda-ukhodyat-dengi",
  "blizhayshee-budushchee",
  "god-vpered",
  "na-vernost",
  "chto-meshaet-otnosheniyam",
] as const;

const START_LINKS = [
  { href: "/numerology/destiny-matrix", label: "Матрица судьбы бесплатно" },
  { href: "/natalnaya-karta", label: "Натальная карта" },
  { href: "/dizayn-cheloveka/rasschitat", label: "Дизайн человека" },
  { href: "/taro#besplatno", label: "Бесплатный расклад Таро" },
] as const;

const DIRECTORY_LINKS = [
  { href: "/photo-rasklad", label: "Расшифровка Таро по фото" },
  { href: "/statyi/besplatnyy-rasklad-taro-online", label: "Что входит в бесплатный расклад" },
  { href: "/statyi/rasshifrovka-taro-po-foto", label: "Как работает расшифровка по фото" },
  { href: "/gadanie", label: "Гадание онлайн" },
  { href: "/gadanie/da-net", label: "Гадание да или нет" },
  { href: "/taro", label: "Таро онлайн" },
  { href: "/runy", label: "Гадание на рунах" },
  { href: "/numerology/destiny-matrix", label: "Матрица судьбы" },
  { href: "/numerology", label: "Нумерология" },
  { href: "/natalnaya-karta", label: "Натальная карта" },
  { href: "/sovmestimost-znakov-zodiaka", label: "Совместимость знаков зодиака" },
  { href: "/prognoz", label: "Прогнозы Таро" },
  { href: "/cards", label: "Значения карт" },
  { href: "/rasklady/lyubov", label: "Расклады на любовь" },
  { href: "/rasklady/vernost-i-doverie", label: "Верность и доверие" },
  { href: "/rasklady/budushchee", label: "На будущее" },
  { href: "/rasklady", label: "Все расклады" },
  { href: "/statyi", label: "Статьи" },
  { href: "/lenormand", label: "Ленорман" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "О сервисе" },
  { href: "/telegram", label: "Telegram-бот" },
] as const;

/**
 * Server-rendered SEO content for home — crawlable without JS.
 */
export default function HomeSeoContent() {
  const intents = HOME_INTENT_SLUGS.map((slug) => getSpreadIntentBySlug(slug)).filter(Boolean);
  const featured = getFeaturedSpreadIntents(4);

  return (
    <section className="home-seo-panel" aria-label="Zovus — матрица, натал, дизайн человека и Таро">
      <div className="home-seo-panel__top">
        <div className="home-seo-panel__intro">
          <p className="home-seo-panel__eyebrow">Каталог</p>
          <h2 className="home-seo-panel__title">
            Zovus — матрица судьбы, натальная карта, дизайн человека и Таро
          </h2>
          <p>
            Zovus — платформа персональных AI-разборов и расчётов. На главной можно начать с{" "}
            <Link href="/numerology/destiny-matrix">матрицы судьбы</Link>
            ,{" "}
            <Link href="/natalnaya-karta">натальной карты</Link>
            ,{" "}
            <Link href="/dizayn-cheloveka/rasschitat">дизайна человека</Link> или открыть три карты Таро
            бесплатно до регистрации. После входа классический расклад на три карты доступен раз в сутки.
          </p>
          <p>
            Можно выбрать готовый вопрос в каталоге, загрузить{" "}
            <Link href="/photo-rasklad">фото домашнего расклада</Link> для расшифровки или начать с{" "}
            <Link href="/gadanie">гадания онлайн</Link>. Есть <Link href="/lenormand">Ленорман</Link>,{" "}
            <Link href="/telegram">Telegram-бот</Link> и раздел <Link href="/faq">FAQ</Link>. Полные
            сессии и углублённые разборы — по тарифу в рунах ᚢ. Это не медицинская и не юридическая
            услуга: <Link href="/disclaimer">подробнее об ограничениях</Link>.
          </p>
        </div>
        <div className="home-seo-panel__ask">
          <HeroQuestionField
            inputId="catalog-question"
            label="Свой вопрос"
            placeholder="Например: вернётся ли он?"
            submitLabel="Разобрать"
            hint="Подберём схему и мастера под ваш вопрос"
            analyticsSource="catalog"
            multiline
            rows={5}
          />
        </div>
      </div>

      <div className="home-seo-panel__block">
        <h2 className="home-seo-panel__kicker">Популярные вопросы</h2>
        <ul className="home-seo-panel__questions">
          {intents.map((intent) =>
            intent ? (
              <li key={intent.slug}>
                <Link href={`/rasklady/${intent.slug}`} className="home-seo-panel__q">
                  {intent.title}
                </Link>
              </li>
            ) : null
          )}
        </ul>
      </div>

      <div className="home-seo-panel__block">
        <h2 className="home-seo-panel__kicker">С чего начать</h2>
        <ul className="home-seo-panel__starts">
          {START_LINKS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="home-seo-panel__start">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <nav className="home-seo-panel__dir" aria-label="Разделы сервиса">
        <h2 className="home-seo-panel__kicker">Разделы</h2>
        <ul className="home-seo-panel__dir-list">
          {DIRECTORY_LINKS.map((item) => (
            <li key={`${item.href}:${item.label}`}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </nav>

      {featured.length > 0 ? (
        <p className="home-seo-panel__featured">
          Также популярны:{" "}
          {featured.map((item, i) => (
            <span key={item.slug}>
              {i > 0 ? ", " : ""}
              <Link href={`/rasklady/${item.slug}`}>{item.title}</Link>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}
