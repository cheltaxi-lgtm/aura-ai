import Link from "next/link";
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

/**
 * Server-rendered SEO content for home — crawlable without JS.
 * Visually hidden: a visible SEO wall above the footer looked like a second tall footer.
 */
export default function HomeSeoContent() {
  const intents = HOME_INTENT_SLUGS.map((slug) => getSpreadIntentBySlug(slug)).filter(Boolean);
  const featured = getFeaturedSpreadIntents(4);

  return (
    <section className="home-seo-panel" aria-label="Расклад Таро онлайн на Zovus">
      <h2 className="font-display text-2xl font-medium text-aura-ivory">
        Расклад Таро онлайн бесплатно — с разбором под ваш вопрос
      </h2>
      <p className="mt-4 leading-relaxed">
        Zovus — сервис раскладов Таро онлайн: вы формулируете вопрос о связи, решении, работе или
        будущем и получаете связный разбор, а не общий шаблон. На главной три карты открываются
        бесплатно до регистрации; после входа классический расклад на три карты — раз в сутки.
      </p>
      <p className="mt-3 leading-relaxed">
        Можно выбрать готовый вопрос в каталоге, загрузить{" "}
        <Link href="/photo-rasklad" className="text-aura-gold hover:underline">
          фото домашнего расклада
        </Link>{" "}
        для расшифровки или начать с{" "}
        <Link href="/gadanie" className="text-aura-gold hover:underline">
          гадания онлайн
        </Link>
        . Есть{" "}
        <Link href="/lenormand" className="text-aura-gold hover:underline">
          Ленорман
        </Link>
        ,{" "}
        <Link href="/dizayn-cheloveka" className="text-aura-gold hover:underline">
          Дизайн Человека
        </Link>
        ,{" "}
        <Link href="/telegram" className="text-aura-gold hover:underline">
          Telegram-бот
        </Link>
        {" "}и раздел{" "}
        <Link href="/faq" className="text-aura-gold hover:underline">
          FAQ
        </Link>
        . Полные сессии, нумерология, натал и обряды — по тарифу в рунах ᚢ. Это не медицинская и не
        юридическая услуга:{" "}
        <Link href="/disclaimer" className="text-aura-gold hover:underline">
          подробнее об ограничениях
        </Link>
        .
      </p>

      <h2 className="mt-8 font-display text-lg text-aura-gold">Популярные вопросы</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {intents.map((intent) =>
          intent ? (
            <li key={intent.slug}>
              <Link
                href={`/rasklady/${intent.slug}`}
                className="block rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 transition hover:border-aura-gold/40 hover:text-aura-gold"
              >
                {intent.title}
              </Link>
            </li>
          ) : null
        )}
      </ul>

      <h2 className="mt-8 font-display text-lg text-aura-gold">С чего начать</h2>
      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        <li>
          <Link href="/taro#besplatno" className="text-aura-gold hover:underline">
            Бесплатный расклад Таро
          </Link>
        </li>
        <li>
          <Link href="/photo-rasklad" className="text-aura-gold hover:underline">
            Расшифровка Таро по фото
          </Link>
        </li>
        <li>
          <Link href="/statyi/besplatnyy-rasklad-taro-online" className="text-aura-gold hover:underline">
            Что входит в бесплатный расклад
          </Link>
        </li>
        <li>
          <Link href="/statyi/rasshifrovka-taro-po-foto" className="text-aura-gold hover:underline">
            Как работает расшифровка по фото
          </Link>
        </li>
        <li>
          <Link href="/gadanie" className="text-aura-gold hover:underline">
            Гадание онлайн
          </Link>
        </li>
        <li>
          <Link href="/gadanie/da-net" className="text-aura-gold hover:underline">
            Гадание да или нет
          </Link>
        </li>
        <li>
          <Link href="/taro" className="text-aura-gold hover:underline">
            Таро онлайн
          </Link>
        </li>
        <li>
          <Link href="/runy" className="text-aura-gold hover:underline">
            Гадание на рунах
          </Link>
        </li>
        <li>
          <Link href="/numerology/destiny-matrix" className="text-aura-gold hover:underline">
            Матрица судьбы
          </Link>
        </li>
        <li>
          <Link href="/numerology" className="text-aura-gold hover:underline">
            Нумерология
          </Link>
        </li>
        <li>
          <Link href="/natalnaya-karta" className="text-aura-gold hover:underline">
            Натальная карта
          </Link>
        </li>
        <li>
          <Link href="/sovmestimost-znakov-zodiaka" className="text-aura-gold hover:underline">
            Совместимость знаков зодиака
          </Link>
        </li>
        <li>
          <Link href="/prognoz" className="text-aura-gold hover:underline">
            Прогнозы Таро
          </Link>
        </li>
        <li>
          <Link href="/cards" className="text-aura-gold hover:underline">
            Значения карт
          </Link>
        </li>
        <li>
          <Link href="/rasklady/lyubov" className="text-aura-gold hover:underline">
            Расклады на любовь
          </Link>
        </li>
        <li>
          <Link href="/rasklady/vernost-i-doverie" className="text-aura-gold hover:underline">
            Верность и доверие
          </Link>
        </li>
        <li>
          <Link href="/rasklady/budushchee" className="text-aura-gold hover:underline">
            На будущее
          </Link>
        </li>
        <li>
          <Link href="/rasklady" className="text-aura-gold hover:underline">
            Все расклады
          </Link>
        </li>
        <li>
          <Link href="/statyi" className="text-aura-gold hover:underline">
            Статьи
          </Link>
        </li>
        <li>
          <Link href="/lenormand" className="text-aura-gold hover:underline">
            Ленорман
          </Link>
        </li>
        <li>
          <Link href="/faq" className="text-aura-gold hover:underline">
            FAQ
          </Link>
        </li>
        <li>
          <Link href="/about" className="text-aura-gold hover:underline">
            О сервисе
          </Link>
        </li>
        <li>
          <Link href="/telegram" className="text-aura-gold hover:underline">
            Telegram-бот
          </Link>
        </li>
      </ul>

      {featured.length > 0 ? (
        <p className="mt-6 text-sm text-white/50">
          Также популярны:{" "}
          {featured.map((item, i) => (
            <span key={item.slug}>
              {i > 0 ? ", " : ""}
              <Link href={`/rasklady/${item.slug}`} className="text-aura-gold hover:underline">
                {item.title}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}
