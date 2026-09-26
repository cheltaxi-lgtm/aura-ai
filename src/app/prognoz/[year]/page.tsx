import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SeasonalForecastPage, { buildMonthLinks } from "@/components/seo/SeasonalForecastPage";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import {
  FORECAST_MONTHS,
  getCurrentForecastYear,
  getForecastYears,
  getYearForecastMeta,
  isPastForecastMonth,
} from "@/lib/seo/seasonal";
import { SEO_ZODIAC_SIGNS } from "@/lib/seo/zodiac-signs";

export const revalidate = 3600;

export function generateStaticParams() {
  return getForecastYears().map((year) => ({ year: String(year) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string }>;
}): Promise<Metadata> {
  const { year: yearStr } = await params;
  const year = Number(yearStr);
  if (!getForecastYears().includes(year)) return { title: "Прогноз" };
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
  if (!getForecastYears().includes(year)) notFound();

  const meta = getYearForecastMeta(year);
  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Прогнозы", path: "/prognoz" },
    { name: String(year), path: meta.path },
  ];

  return (
    <SeasonalForecastPage
      h1={meta.h1}
      intro={`Готового прогноза на ${year} год по одной дате или знаку нет. Выберите период и задайте картам вопрос о конкретном решении: так ответ можно сопоставить с вашим планом и событиями, а не принимать за обещание будущего.`}
      breadcrumbs={breadcrumbs}
      path={meta.path}
      metaTitle={meta.title}
      metaDescription={meta.description}
      themes={["какое решение предстоит принять", "какие ресурсы уже есть", "что зависит от других людей", "по какому признаку проверить результат"]}
      monthLinks={buildMonthLinks(year, FORECAST_MONTHS.filter((month) => !isPastForecastMonth(year, month)))}
      zodiacLinks={year === getCurrentForecastYear()
        ? SEO_ZODIAC_SIGNS.map((s) => ({
            label: `${s.name} ${s.emoji}`,
            href: `/prognoz/znak/${s.slug}`,
          }))
        : []}
      intentLinks={[
        { label: "Год вперёд — расклад по месяцам", href: "/rasklady/god-vpered" },
        { label: "Ближайшее будущее", href: "/rasklady/blizhayshee-budushchee" },
        { label: "Прогноз на месяц", href: "/rasklady/prognoz-na-mesyac" },
      ]}
      faq={[
        {
          q: `Как читать прогноз Таро на ${year} год?`,
          a: "Разделите год на периоды и запишите один вопрос для каждого решения. В раскладе «Год вперёд» читайте карты по их позициям; общие темы на этой странице не являются выпавшими картами.",
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
          heading: "Как составить вопрос на месяц",
          body: `Назовите событие или выбор с реальным сроком, например: «Что поможет мне подготовиться к смене работы до конца месяца?» После расклада запишите один шаг, который можете сделать сами, и дату, когда вернётесь к ответу. Прошедшие месяцы ${year} года не предлагаются как актуальный прогноз.`,
        },
        {
          heading: "Как проверить трактовку",
          body: "Не подгоняйте любое событие под символ карты. Сначала сохраните своё понимание, затем сравните его с наблюдаемыми фактами и отметьте, что осталось неопределённым. Вопрос о здоровье, деньгах или другом важном решении проверяйте у профильного специалиста.",
        },
      ]}
    />
  );
}
