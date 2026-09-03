import Link from "next/link";
import HeroQuestionField from "@/components/seo/HeroQuestionField";
import { getSpreadIntentBySlug } from "@/lib/spread-intents";

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
  { href: "/dizayn-cheloveka/sovmestimost", label: "Совместимость Дизайн Человека" },
  { href: "/taro#besplatno", label: "Бесплатный расклад Таро" },
  { href: "/aura", label: "Аура по фото" },
] as const;

/**
 * Server-rendered SEO content for home — crawlable without JS.
 */
export default function HomeSeoContent() {
  const intents = HOME_INTENT_SLUGS.map((slug) => getSpreadIntentBySlug(slug)).filter(Boolean);

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
            <Link href="/dizayn-cheloveka/rasschitat">дизайна человека</Link>
            ,{" "}
            <Link href="/dizayn-cheloveka/sovmestimost">совместимости по Дизайну Человека</Link> или
            открыть три карты Таро бесплатно до регистрации. Первый расклад после входа не
            перетягивается и это не карта дня. Три карты дня — отдельный ритуал раз в сутки.
          </p>
          <p>
            Можно выбрать готовый вопрос в каталоге, загрузить{" "}
            <Link href="/photo-rasklad">фото домашнего расклада</Link> для расшифровки, снять{" "}
            <Link href="/aura">ауру по фото</Link> или начать с{" "}
            <Link href="/gadanie">гадания онлайн</Link>
            {" "}и{" "}
            <Link href="/gadanie/besplatno">бесплатного старта</Link>. Есть{" "}
            <Link href="/gadanie/karta-dnya">карта дня</Link>,{" "}
            <Link href="/goroskop-na-segodnya">гороскоп на сегодня</Link>,{" "}
            <Link href="/lenormand">Ленорман</Link>,{" "}
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

    </section>
  );
}
