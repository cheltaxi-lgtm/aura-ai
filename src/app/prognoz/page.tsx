import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadataWithOverrides } from "@/lib/seo/metadata";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import {
  FORECAST_MONTHS,
  getForecastYears,
  getCurrentForecastMonth,
  getCurrentForecastYear,
  isPastForecastMonth,
} from "@/lib/seo/seasonal";
import { SEO_ZODIAC_SIGNS } from "@/lib/seo/zodiac-signs";
import { AdsSeoH1, AdsSeoJsonLd, AdsSeoRelatedTools } from "@/components/seo/AdsSeoEnhancements";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return buildSeoMetadataWithOverrides("/prognoz", {
    title: "Прогноз Таро — по месяцам и знакам зодиака | Zovus",
    description:
      "Как выбрать вопрос для личного прогноза Таро на год и месяц: схемы раскладов, темы знаков зодиака и бесплатный расклад на сутки.",
    path: "/prognoz",
  });
}

const faq = [
  {
    q: "Чем прогноз Таро отличается от натальной карты?",
    a: "Прогноз Таро строится по лично выпавшим картам и вопросу на выбранный период. Натальная карта строится по данным рождения. Статьи этого раздела помогают подготовить вопрос, но сами по себе не являются личным прогнозом.",
  },
  {
    q: "Можно ли смотреть и матрицу судьбы, и прогноз?",
    a: "Да, но это разные символические методы. Матрица опирается на дату рождения, а расклад Таро — на вопрос и выпавшие карты. Сравнивайте выводы с реальными обстоятельствами, особенно перед важным решением.",
  },
];

export default async function PrognozIndexPage() {
  const year = getCurrentForecastYear();
  const month = getCurrentForecastMonth();
  const structuredData = buildForecastStructuredData({
    title: "Прогноз Таро",
    description:
      "Как выбрать вопрос для личного прогноза Таро на год и месяц: схемы раскладов, темы знаков зодиака и бесплатный расклад на сутки.",
    path: "/prognoz",
    faq,
  });

  return (
    <SeoPageShell backHref="/taro" backLabel="Таро онлайн">
      <SeoPageTracker goal="prognoz_hub_view" />
      <p className="text-sm text-aura-gold/80">Прогнозы</p>
      <AdsSeoH1 path="/prognoz">Прогноз Таро</AdsSeoH1>
      <p className="mt-4 text-white/70">
        Выберите период и сформулируйте вопрос для личного расклада. Страницы по знакам помогают
        выбрать тему, но не обещают события без выпавших карт. Если ищете
        «гороскоп на сегодня» —{" "}
        <Link href="/goroskop-na-segodnya" className="text-aura-gold hover:underline">
          разбор шаблона и натальной карты
        </Link>
        .
      </p>

      <div className="mt-6">
        <SeoTrackedCta href="/?daily=1" trackGoal="gadanie_karta_dnya_cta_click" trackParams={{ target: "daily_reading", source: "forecast_hub" }}>
          Бесплатный расклад на сутки
        </SeoTrackedCta>
      </div>

      <SeoSection title="Актуальный период">
        <ul className="space-y-2">
          <li>
            <Link href={`/prognoz/${year}`} className="text-aura-gold hover:underline">
              Прогноз на {year} год
            </Link>
          </li>
          <li>
            <Link href={`/prognoz/${year}/${month.slug}`} className="text-aura-gold hover:underline">
              Таро на {month.name} {year}
            </Link>
          </li>
        </ul>
      </SeoSection>

      <SeoSection title="Годы">
        <ul className="flex flex-wrap gap-2">
          {getForecastYears().filter((forecastYear) => forecastYear >= year).map((y) => (
            <li key={y}>
              <Link
                href={`/prognoz/${y}`}
                className="rounded-full border border-white/15 px-3 py-1.5 text-sm hover:border-aura-gold/40"
              >
                {y}
              </Link>
            </li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection title={`Месяцы ${year}`}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {FORECAST_MONTHS.filter((m) => !isPastForecastMonth(year, m)).map((m) => (
            <li key={m.slug}>
              <Link
                href={`/prognoz/${year}/${m.slug}`}
                className="block rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-aura-gold hover:underline"
              >
                {m.name.charAt(0).toUpperCase()}
                {m.name.slice(1)} {year}
              </Link>
            </li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection title="Знаки зодиака">
        <ul className="flex flex-wrap gap-2">
          {SEO_ZODIAC_SIGNS.map((sign) => (
            <li key={sign.slug}>
              <Link
                href={`/prognoz/znak/${sign.slug}`}
                className="rounded-full border border-white/15 px-3 py-1.5 text-sm hover:border-aura-gold/40"
              >
                {sign.name} {sign.emoji}
              </Link>
            </li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <AdsSeoRelatedTools path="/prognoz" excludeHrefs={["/prognoz"]} />
      <AdsSeoJsonLd path="/prognoz" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
