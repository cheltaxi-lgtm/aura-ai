import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadataWithOverrides } from "@/lib/seo/metadata";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import {
  FORECAST_MONTHS,
  FORECAST_YEARS,
  getCurrentForecastMonth,
  getCurrentForecastYear,
} from "@/lib/seo/seasonal";
import { SEO_ZODIAC_SIGNS } from "@/lib/seo/zodiac-signs";
import { AdsSeoH1, AdsSeoJsonLd, AdsSeoRelatedTools } from "@/components/seo/AdsSeoEnhancements";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";

export async function generateMetadata(): Promise<Metadata> {
  return buildSeoMetadataWithOverrides("/prognoz", {
    title: "Прогноз Таро — по месяцам и знакам зодиака | Zovus",
    description:
      "Прогнозы Таро на год и месяц, расклады по знакам зодиака. Актуальные периоды — онлайн на Zovus.",
    path: "/prognoz",
  });
}

const faq = [
  {
    q: "Чем прогноз Таро отличается от натальной карты?",
    a: "Прогноз Таро — обзор периода по картам. Натальная карта показывает ваш базовый портрет по дате рождения. Оба подхода можно сочетать: сначала карта, затем прогноз на месяц.",
  },
  {
    q: "Можно ли смотреть и матрицу судьбы, и прогноз?",
    a: "Да. Матрица даёт числовой каркас года и предназначения, прогноз Таро — динамику месяца. Начните с /numerology/destiny-matrix или /natalnaya-karta, затем вернитесь к прогнозу.",
  },
];

export default async function PrognozIndexPage() {
  const year = getCurrentForecastYear();
  const month = getCurrentForecastMonth();
  const structuredData = buildForecastStructuredData({
    title: "Прогноз Таро",
    description:
      "Прогнозы Таро на год и месяц, расклады по знакам зодиака. Актуальные периоды — онлайн на Zovus.",
    path: "/prognoz",
    faq,
  });

  return (
    <SeoPageShell backHref="/taro" backLabel="Таро онлайн">
      <SeoPageTracker goal="prognoz_hub_view" />
      <p className="text-sm text-aura-gold/80">Прогнозы</p>
      <AdsSeoH1 path="/prognoz">Прогноз Таро</AdsSeoH1>
      <p className="mt-4 text-white/70">
        Годовые и месячные обзоры по картам, а также прогнозы для каждого знака зодиака. Если ищете
        «гороскоп на сегодня» —{" "}
        <Link href="/goroskop-na-segodnya" className="text-aura-gold hover:underline">
          разбор шаблона и натальной карты
        </Link>
        .
      </p>

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
          {FORECAST_YEARS.map((y) => (
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
          {FORECAST_MONTHS.map((m) => (
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
