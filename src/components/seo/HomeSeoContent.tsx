import Link from "next/link";
import { getFeaturedSpreadIntents, getSpreadIntentBySlug } from "@/lib/spread-intents";

const HOME_INTENT_SLUGS = [
  "chto-on-chuvstvuet",
  "vernyotsya-li-on",
  "lyubit-li-on-menya",
  "pozvonit-li-on",
  "est-li-izmena",
  "budem-li-my-vmeste",
  "stoit-li-menyat-rabotu",
  "god-vpered",
] as const;

/** Server-rendered SEO content for home — crawlable without JS. */
export default function HomeSeoContent() {
  const intents = HOME_INTENT_SLUGS.map((slug) => getSpreadIntentBySlug(slug)).filter(Boolean);
  const featured = getFeaturedSpreadIntents(4);

  return (
    <section className="seo-crawl-only" aria-label="О сервисе Zovus">
      <p className="font-display text-2xl font-bold">
        Расклады Таро онлайн с персональной расшифровкой
      </p>
      <p className="mt-4 leading-relaxed">
        Zovus — сервис персональных эзотерических консультаций с ИИ-мастерами в художественных
        образах. Вы выбираете вопрос — о чувствах, отношениях, верности, карьере или будущем —
        мастер раскладывает карты по проверенной схеме и даёт связную трактовку в чате. После
        расшифровки можно уточнять детали, сохранять историю в кабинете и продолжать диалог.
      </p>
      <p className="mt-3 leading-relaxed">
        Откройте бесплатный расклад из трёх карт на главной. После регистрации расклад сохраняется в
        кабинете. Полные расклады, фото-анализ, нумерология и обряды — по тарифу в рунах ᚢ. Это не
        медицинская и не юридическая услуга:{" "}
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

      <h2 className="mt-8 font-display text-lg text-aura-gold">Тематические разделы</h2>
      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
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
          <Link href="/numerology" className="text-aura-gold hover:underline">
            Нумерология
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
          <Link href="/rasklady/budushchee" className="text-aura-gold hover:underline">
            На будущее
          </Link>
        </li>
        <li>
          <Link href="/rasklady/chuvstva-i-myisli" className="text-aura-gold hover:underline">
            Чувства и мысли
          </Link>
        </li>
        <li>
          <Link href="/rasklady/vernost-i-doverie" className="text-aura-gold hover:underline">
            Верность и доверие
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
          <Link href="/about/methodology" className="text-aura-gold hover:underline">
            Методика
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
