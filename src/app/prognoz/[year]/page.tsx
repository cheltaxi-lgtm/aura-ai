import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SeasonalForecastPage, { buildMonthLinks } from "@/components/seo/SeasonalForecastPage";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import {
  FORECAST_MONTHS,
  FORECAST_YEARS,
  getYearForecastMeta,
} from "@/lib/seo/seasonal";
import { SEO_ZODIAC_SIGNS } from "@/lib/seo/zodiac-signs";

export function generateStaticParams() {
  return FORECAST_YEARS.map((year) => ({ year: String(year) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string }>;
}): Promise<Metadata> {
  const { year: yearStr } = await params;
  const year = Number(yearStr);
  if (!FORECAST_YEARS.includes(year as (typeof FORECAST_YEARS)[number])) return { title: "Прогноз" };
  const meta = getYearForecastMeta(year);
  return buildSeoMetadata(meta);
}

export default async function PrognozYearPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year: yearStr } = await params;
  const year = Number(yearStr);
  if (!FORECAST_YEARS.includes(year as (typeof FORECAST_YEARS)[number])) notFound();

  const meta = getYearForecastMeta(year);
  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Прогнозы", path: "/prognoz" },
    { name: String(year), path: meta.path },
  ];

  return (
    <SeasonalForecastPage
      h1={meta.h1}
      intro={`Годовой обзор по картам Таро: ${year} — время для планирования, осознанных решений и регулярной практики раскладов.`}
      breadcrumbs={breadcrumbs}
      path={meta.path}
      metaTitle={meta.title}
      metaDescription={meta.description}
      themes={["любовь и отношения", "карьера и финансы", "личный рост", "ключевые повороты года"]}
      monthLinks={buildMonthLinks(year, FORECAST_MONTHS)}
      zodiacLinks={SEO_ZODIAC_SIGNS.map((s) => ({
        label: `${s.name} ${s.emoji}`,
        href: `/prognoz/znak/${s.slug}`,
      }))}
      intentLinks={[
        { label: "Год вперёд — расклад по месяцам", href: "/rasklady/god-vpered" },
        { label: "Ближайшее будущее", href: "/rasklady/blizhayshee-budushchee" },
        { label: "Прогноз на месяц", href: "/rasklady/prognoz-na-mesyac" },
      ]}
      faq={[
        {
          q: `Как читать прогноз Таро на ${year} год?`,
          a: "Годовой обзор задаёт темы периода. Для персонального ответа сделайте расклад «Год вперёд» или выберите месяц.",
        },
        {
          q: "Это точное предсказание?",
          a: "Карты показывают тенденции и совет, а не фиксированную судьбу. Решения остаются за вами.",
        },
      ]}
      ctaHref="/rasklady/god-vpered"
      ctaLabel="Расклад «Год вперёд»"
      extraSections={[
        {
          heading: "Расклад Таро по месяцам",
          body: `Каждый месяц ${year} года несёт свою энергию. Выберите месяц ниже — или пройдите полный расклад с мастером.`,
        },
      ]}
    />
  );
}
