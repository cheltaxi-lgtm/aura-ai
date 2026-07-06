import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SeasonalForecastPage from "@/components/seo/SeasonalForecastPage";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import {
  FORECAST_MONTHS,
  getCurrentForecastMonth,
  getCurrentForecastYear,
  getZodiacSignForecastMeta,
} from "@/lib/seo/seasonal";
import { getAllSeoZodiacSlugs, getSeoZodiacBySlug } from "@/lib/seo/zodiac-signs";

export function generateStaticParams() {
  return getAllSeoZodiacSlugs().map((sign) => ({ sign }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sign: string }>;
}): Promise<Metadata> {
  const { sign: signSlug } = await params;
  const sign = getSeoZodiacBySlug(signSlug);
  if (!sign) return { title: "Прогноз" };
  const year = getCurrentForecastYear();
  return buildSeoMetadata(getZodiacSignForecastMeta(sign.name, sign.slug, year));
}

export default async function PrognozZodiacPage({
  params,
}: {
  params: Promise<{ sign: string }>;
}) {
  const { sign: signSlug } = await params;
  const sign = getSeoZodiacBySlug(signSlug);
  if (!sign) notFound();

  const year = getCurrentForecastYear();
  const currentMonth = getCurrentForecastMonth();
  const meta = getZodiacSignForecastMeta(sign.name, sign.slug, year);
  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Прогнозы", path: "/prognoz" },
    { name: sign.name, path: meta.path },
  ];

  return (
    <SeasonalForecastPage
      h1={meta.h1}
      intro={`Прогноз Таро для знака ${sign.name} ${sign.emoji} на ${year} год. Стихия — ${sign.elementRu}. Выберите месяц или сделайте персональный расклад.`}
      breadcrumbs={breadcrumbs}
      path={meta.path}
      metaTitle={meta.title}
      metaDescription={meta.description}
      themes={[`любовь для ${sign.name}`, "карьера и финансы", "личная энергия знака", "совет арканов"]}
      monthLinks={FORECAST_MONTHS.map((m) => ({
        label: `${sign.name} — ${m.name} ${year}`,
        href: `/prognoz/znak/${sign.slug}/${m.slug}`,
      }))}
      intentLinks={[
        {
          label: `Актуальный месяц (${currentMonth.name})`,
          href: `/prognoz/znak/${sign.slug}/${currentMonth.slug}`,
        },
        { label: "Расклад на месяц", href: "/rasklady/prognoz-na-mesyac" },
        { label: "Год вперёд", href: "/rasklady/god-vpered" },
      ]}
      faq={[
        {
          q: `Как читать Таро для ${sign.name}?`,
          a: "Знак задаёт контекст энергии, но расклад всегда персонален — карты отвечают на ваш конкретный вопрос.",
        },
        {
          q: "Нужна дата рождения?",
          a: "Для общего прогноза по знаку — нет. В анкете расклада дата помогает мастеру точнее связать символы с вашей картой.",
        },
      ]}
      extraSections={[
        {
          heading: `Таро и знак ${sign.name}`,
          body: `${sign.name} (${sign.elementRu}) — прогноз по месяцам ниже. Для личного вопроса используйте каталог раскладов или чат с мастером.`,
        },
      ]}
    />
  );
}
