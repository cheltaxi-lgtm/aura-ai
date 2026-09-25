import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SeasonalForecastPage from "@/components/seo/SeasonalForecastPage";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import {
  FORECAST_MONTHS,
  getCurrentForecastYear,
  getForecastMonthBySlug,
  getMonthForecastThemes,
  getZodiacMonthInsight,
  getZodiacSignForecastMeta,
} from "@/lib/seo/seasonal";
import { getAllSeoZodiacSlugs, getSeoZodiacBySlug } from "@/lib/seo/zodiac-signs";

export const revalidate = 3600;

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
  const year = getCurrentForecastYear();
  return buildSeoMetadata(getZodiacSignForecastMeta(sign, year, month));
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

  const year = getCurrentForecastYear();
  const meta = getZodiacSignForecastMeta(sign, year, month);
  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Прогнозы", path: "/prognoz" },
    { name: sign.name, path: `/prognoz/znak/${sign.slug}` },
    { name: month.name, path: meta.path },
  ];

  return (
    <SeasonalForecastPage
      h1={meta.h1}
      intro={getZodiacMonthInsight(sign, month)}
      breadcrumbs={breadcrumbs}
      path={meta.path}
      metaTitle={meta.title}
      metaDescription={meta.description}
      themes={[...getMonthForecastThemes(month), sign.exampleQuestion]}
      intentLinks={[
        { label: "Расклад на месяц", href: "/rasklady/prognoz-na-mesyac" },
        { label: "На отношения", href: "/rasklady/lyubov" },
        { label: "На карьеру", href: "/rasklady/kariera" },
      ]}
      faq={[
        {
          q: `Чем полезен расклад для ${sign.nameGenitive} на ${month.name}?`,
          a: "Он помогает разобрать ваш вопрос в выбранный период. Сам знак не даёт готового прогноза и не заменяет выпавшие карты.",
        },
        {
          q: "Можно совместить знак и конкретный вопрос?",
          a: `Да. Например: «${sign.exampleQuestion}» Укажите период и обстоятельства, чтобы трактовка относилась к вашей ситуации.`,
        },
      ]}
      extraSections={[
        {
          heading: `Вопрос для ${sign.nameGenitive}`,
          body: `${sign.readingFocus} В ${month.namePrepositional} выберите одну ситуацию, связанную с темой «${getMonthForecastThemes(month)[0]}», и назовите решение, которое предстоит принять.`,
        },
        {
          heading: "Как проверить ответ",
          body: sign.interpretation,
        },
      ]}
    />
  );
}
