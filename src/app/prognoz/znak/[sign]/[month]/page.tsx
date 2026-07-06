import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SeasonalForecastPage from "@/components/seo/SeasonalForecastPage";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import {
  FORECAST_MONTHS,
  FORECAST_YEARS,
  getForecastMonthBySlug,
  getMonthForecastThemes,
  getZodiacMonthInsight,
  getZodiacSignForecastMeta,
} from "@/lib/seo/seasonal";
import { getAllSeoZodiacSlugs, getSeoZodiacBySlug } from "@/lib/seo/zodiac-signs";

export function generateStaticParams() {
  return getAllSeoZodiacSlugs().flatMap((sign) =>
    FORECAST_MONTHS.map((month) => ({ sign, month: month.slug }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sign: string; month: string }>;
}): Promise<Metadata> {
  const { sign: signSlug, month: monthSlug } = await params;
  const sign = getSeoZodiacBySlug(signSlug);
  const month = getForecastMonthBySlug(monthSlug);
  if (!sign || !month) return { title: "Прогноз" };
  const year = FORECAST_YEARS[0];
  return buildSeoMetadata(getZodiacSignForecastMeta(sign.name, sign.slug, year, month));
}

export default async function PrognozZodiacMonthPage({
  params,
}: {
  params: Promise<{ sign: string; month: string }>;
}) {
  const { sign: signSlug, month: monthSlug } = await params;
  const sign = getSeoZodiacBySlug(signSlug);
  const month = getForecastMonthBySlug(monthSlug);
  if (!sign || !month) notFound();

  const year = FORECAST_YEARS[0];
  const meta = getZodiacSignForecastMeta(sign.name, sign.slug, year, month);
  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Прогнозы", path: "/prognoz" },
    { name: sign.name, path: `/prognoz/znak/${sign.slug}` },
    { name: month.name, path: meta.path },
  ];

  return (
    <SeasonalForecastPage
      h1={meta.h1}
      intro={getZodiacMonthInsight(sign.name, month)}
      breadcrumbs={breadcrumbs}
      path={meta.path}
      metaTitle={meta.title}
      metaDescription={meta.description}
      themes={getMonthForecastThemes(month)}
      intentLinks={[
        { label: "Расклад на месяц", href: "/rasklady/prognoz-na-mesyac" },
        { label: "На отношения", href: "/rasklady/lyubov" },
        { label: "На карьеру", href: "/rasklady/kariera" },
      ]}
      faq={[
        {
          q: `Чем полезен прогноз для ${sign.name} на ${month.name}?`,
          a: "Он задаёт ориентиры месяца. Для точного ответа на личный вопрос сделайте тематический расклад.",
        },
        {
          q: "Можно совместить знак и конкретный вопрос?",
          a: "Да. Укажите знак в профиле — мастер учтёт его в трактовке вашего расклада.",
        },
      ]}
      extraSections={[
        {
          heading: `Ключевые темы для ${sign.name}`,
          body: `В ${month.namePrepositional} для ${sign.name} (${sign.elementRu}) акцент на ${getMonthForecastThemes(month).join(", ")}.`,
        },
      ]}
    />
  );
}
