import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import { SEO_ZODIAC_SIGNS } from "@/lib/seo/zodiac-signs";
import { getCurrentForecastMonth, getCurrentForecastYear } from "@/lib/seo/seasonal";

export const metadata: Metadata = buildSeoMetadata({
  title: "Гороскоп на сегодня — знак зодиака и натальная карта | Zovus",
  description:
    "Гороскоп на сегодня: чем шаблон по знаку отличается от натальной карты. Прогнозы Таро по 12 знакам, персональный расчёт и расклад на сегодня — Zovus.",
  path: "/goroskop-na-segodnya",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Прогнозы", path: "/prognoz" },
  { name: "Гороскоп на сегодня", path: "/goroskop-na-segodnya" },
];

const faq = [
  {
    q: "Почему гороскоп на сегодня часто не попадает?",
    a: "Солнечный знак делит людей на 12 групп. У двух Львов разное время и место рождения — разный асцендент, дома и аспекты. Шаблонный гороскоп говорит о знаке, натальная карта — о конкретном небе в момент рождения.",
  },
  {
    q: "Есть ли на Zovus ежедневный гороскоп по знаку?",
    a: "Мы не публикуем тонкий «гороскоп на сегодня» из одной фразы на всех. Есть прогноз Таро по знаку на год и месяц, расклад на сегодня и персональная натальная карта.",
  },
  {
    q: "С чего начать, если хочется ориентир на день?",
    a: "Если нужен тон дня — карта дня или расклад на сегодня. Если нужен портрет характера и периодов — натальная карта. Знак зодиака полезен как вход, но не заменяет расчёт.",
  },
];

export default function GoroskopNaSegodnyaPage() {
  const year = getCurrentForecastYear();
  const month = getCurrentForecastMonth();
  const structuredData = buildForecastStructuredData({
    title: "Гороскоп на сегодня",
    description:
      "Гороскоп на сегодня: знак зодиака как вход, натальная карта как персональный слой, прогноз Таро по знакам.",
    path: "/goroskop-na-segodnya",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="goroskop_na_segodnya_view" />
      <p className="text-sm text-aura-gold/80">Астрология · Сегодня</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Гороскоп на сегодня</h1>
      <p className="mt-4 text-white/70">
        «Гороскоп на сегодня» в поиске почти всегда означает короткий текст по солнечному знаку. На
        Zovus мы честно разделяем шаблон и персональный расчёт: знак — удобный вход, натальная карта —
        небо в момент вашего рождения, Таро — динамика периода.
      </p>

      <SeoSection title="Что выбрать вместо общей фразы">
        <div className="grid gap-3">
          <Link
            href="/natalnaya-karta"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Натальная карта</p>
            <p className="mt-1 text-sm text-white/70">
              Дата, время и место рождения — планеты, дома и аспекты. Это не гороскоп «для всех Овнов».
            </p>
            <p className="mt-2 text-sm text-aura-gold">Построить карту →</p>
          </Link>
          <Link
            href="/rasklady/na-segodnya"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Расклад на сегодня</p>
            <p className="mt-1 text-sm text-white/70">
              Карты по текущему дню, если нужен сюжет «что сейчас происходит», а не портрет характера.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Открыть расклад →</p>
          </Link>
          <Link
            href="/gadanie/karta-dnya"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Карта дня</p>
            <p className="mt-1 text-sm text-white/70">
              Одна карта или ежедневные три карты после входа — ритуал внимания, не солнечный гороскоп.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Разобрать форматы →</p>
          </Link>
        </div>
      </SeoSection>

      <SeoSection title={`Прогноз Таро по знаку · ${month.name} ${year}`}>
        <p className="mb-3 text-sm text-white/60">
          Это обзор периода по картам для знака, а не ежедневная колонка. Персональный слой — в
          натальной карте.
        </p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SEO_ZODIAC_SIGNS.map((sign) => (
            <li key={sign.slug}>
              <Link
                href={`/prognoz/znak/${sign.slug}`}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition hover:border-aura-gold/40"
              >
                <span aria-hidden>{sign.emoji}</span>
                <span>{sign.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/natalnaya-karta" trackGoal="goroskop_na_segodnya_cta_click">
          Построить натальную карту
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/prognoz"
          variant="ghost"
          trackGoal="goroskop_na_segodnya_cta_click"
          trackParams={{ target: "prognoz" }}
        >
          Прогнозы Таро
        </SeoTrackedCta>
      </div>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <SeoRelatedTools
        excludeHrefs={["/prognoz", "/goroskop-na-segodnya"]}
        extraLinks={[
          { href: "/sovmestimost-znakov-zodiaka", label: "Совместимость знаков" },
          { href: "/gadanie/karta-dnya", label: "Карта дня" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
