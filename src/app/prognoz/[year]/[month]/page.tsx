import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SeasonalForecastPage from "@/components/seo/SeasonalForecastPage";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import {
  FORECAST_MONTHS,
  FORECAST_YEARS,
  getForecastMonthBySlug,
  getMonthForecastMeta,
  getMonthForecastThemes,
} from "@/lib/seo/seasonal";
import { SEO_ZODIAC_SIGNS } from "@/lib/seo/zodiac-signs";

export function generateStaticParams() {
  return FORECAST_YEARS.flatMap((year) =>
    FORECAST_MONTHS.map((month) => ({ year: String(year), month: month.slug }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}): Promise<Metadata> {
  const { year: yearStr, month: monthSlug } = await params;
  const year = Number(yearStr);
  const month = getForecastMonthBySlug(monthSlug);
  if (!month || !FORECAST_YEARS.includes(year as (typeof FORECAST_YEARS)[number])) {
    return { title: "Прогноз" };
  }
  return buildSeoMetadata(getMonthForecastMeta(year, month));
}

export default async function PrognozMonthPage({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}) {
  const { year: yearStr, month: monthSlug } = await params;
  const year = Number(yearStr);
  const month = getForecastMonthBySlug(monthSlug);
  if (!month || !FORECAST_YEARS.includes(year as (typeof FORECAST_YEARS)[number])) notFound();

  const meta = getMonthForecastMeta(year, month);
  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Прогнозы", path: "/prognoz" },
    { name: String(year), path: `/prognoz/${year}` },
    { name: month.name, path: meta.path },
  ];

  return (
    <SeasonalForecastPage
      h1={meta.h1}
      intro={`Прогноз по картам на ${month.name} ${year}: основные темы месяца, совет арканов и ссылки на расклады по вашей ситуации.`}
      breadcrumbs={breadcrumbs}
      path={meta.path}
      metaTitle={meta.title}
      metaDescription={meta.description}
      themes={getMonthForecastThemes(month)}
      zodiacLinks={SEO_ZODIAC_SIGNS.map((s) => ({
        label: `${s.name} на ${month.name}`,
        href: `/prognoz/znak/${s.slug}/${month.slug}`,
      }))}
      intentLinks={[
        { label: "Расклад на месяц", href: "/rasklady/prognoz-na-mesyac" },
        { label: "Карта дня", href: "/rasklady/karta-dnya" },
        { label: "Ближайшее будущее", href: "/rasklady/blizhayshee-budushchee" },
      ]}
      faq={[
        {
          q: `Какой расклад подходит на ${month.name}?`,
          a: "Для обзора месяца — «Прогноз на месяц» или три карты. Для любви и работы — тематические вопросы в каталоге.",
        },
        {
          q: "Можно ли уточнить прогноз в чате?",
          a: "Да. После расклада мастер ответит на уточняющие вопросы в диалоге.",
        },
      ]}
      extraSections={[
        {
          heading: `Совет карт на ${month.name}`,
          body: `В ${month.namePrepositional} полезно обратить внимание на ${getMonthForecastThemes(month).join(", ")}. Расклад поможет увидеть, где вы получаете поддержку арканов.`,
        },
      ]}
    />
  );
}
