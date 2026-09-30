import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SeasonalForecastPage from "@/components/seo/SeasonalForecastPage";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import {
  FORECAST_MONTHS,
  getForecastYears,
  getForecastMonthBySlug,
  getMonthForecastMeta,
  getMonthForecastThemes,
  isPastForecastMonth,
} from "@/lib/seo/seasonal";
import { SEO_ZODIAC_SIGNS } from "@/lib/seo/zodiac-signs";

export const revalidate = 3600;

export function generateStaticParams() {
  return getForecastYears().flatMap((year) =>
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
  if (!month || !getForecastYears().includes(year)) {
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
  if (!month || !getForecastYears().includes(year)) notFound();

  const meta = getMonthForecastMeta(year, month);
  const isPast = isPastForecastMonth(year, month);
  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Прогнозы", path: "/prognoz" },
    { name: String(year), path: `/prognoz/${year}` },
    { name: month.name, path: meta.path },
  ];

  return (
    <SeasonalForecastPage
      h1={meta.h1}
      intro={isPast
        ? `${month.name} ${year} уже прошёл. Эту страницу можно использовать для разбора принятого решения; как актуальный прогноз прошедший месяц не показывается в поиске.`
        : `Чтобы получить прогноз Таро на ${month.name} ${year}, выберите реальный вопрос и сделайте личный расклад. Темы ниже помогают подготовиться, но не являются картами, выпавшими за вас.`}
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
        { label: "Расклад на сутки", href: "/gadanie/karta-dnya" },
        { label: "Ближайшее будущее", href: "/rasklady/blizhayshee-budushchee" },
      ]}
      faq={[
        {
          q: `Какой расклад подходит на ${month.name}?`,
          a: "Для общего вопроса выберите «Прогноз на месяц». Если важны отношения или работа, сформулируйте одну конкретную ситуацию и выберите тематический расклад.",
        },
        {
          q: "Можно ли уточнить прогноз в чате?",
          a: "Да. После расклада мастер ответит на уточняющие вопросы в диалоге.",
        },
      ]}
      extraSections={[
        {
          heading: `Вопросы на ${month.name}`,
          body: `Выберите одну тему из списка — ${getMonthForecastThemes(month).join(", ")}. Вместо «что случится со мной?» спросите, какое решение стоит подготовить, что может помешать и какой ресурс уже доступен. Затем сравните ответ с конкретными событиями месяца.`,
        },
        {
          heading: "После расклада",
          body: "Запишите дату, вопрос и один вывод своими словами. Вернитесь к записи в конце периода: что подтвердилось, что вы поняли иначе и какое действие оказалось полезным? Это помогает отличить реальную пользу от слишком общей формулировки.",
        },
      ]}
    />
  );
}
