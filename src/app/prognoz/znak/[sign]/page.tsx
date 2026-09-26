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
  isPastForecastMonth,
} from "@/lib/seo/seasonal";
import { getAllSeoZodiacSlugs, getSeoZodiacBySlug } from "@/lib/seo/zodiac-signs";

export const revalidate = 3600;

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
  return buildSeoMetadata(getZodiacSignForecastMeta(sign, year));
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
  const meta = getZodiacSignForecastMeta(sign, year);
  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Прогнозы", path: "/prognoz" },
    { name: sign.name, path: meta.path },
  ];

  return (
    <SeasonalForecastPage
      h1={meta.h1}
      intro={`Один знак зодиака не может предсказать события ${year} года. Здесь — способ сформулировать свой вопрос и прочитать личный расклад, если вам близок образ ${sign.nameGenitive} ${sign.emoji}. Для ответа нужны сами карты и обстоятельства вашей жизни.`}
      breadcrumbs={breadcrumbs}
      path={meta.path}
      metaTitle={meta.title}
      metaDescription={meta.description}
      themes={["одна конкретная ситуация вместо общего предсказания", sign.exampleQuestion, "действие, которое можно проверить в жизни"]}
      monthLinks={FORECAST_MONTHS.filter((m) => !isPastForecastMonth(year, m)).map((m) => ({
        label: `${sign.name} — ${m.name} ${year}`,
        href: `/prognoz/znak/${sign.slug}/${m.slug}`,
      }))}
      intentLinks={[
        {
          label: `Актуальный месяц (${currentMonth.name})`,
          href: `/prognoz/znak/${sign.slug}/${currentMonth.slug}`,
        },
        { label: "Расклад на месяц", href: "/rasklady/prognoz-na-mesyac" },
        { label: "Бесплатный расклад на сутки", href: "/gadanie/karta-dnya" },
        { label: "Год вперёд", href: "/rasklady/god-vpered" },
      ]}
      faq={[
        {
          q: `Как читать Таро для ${sign.nameGenitive}?`,
          a: `Сначала задайте вопрос: «${sign.exampleQuestion}» Затем прочитайте каждую карту в её позиции и сравните вывод с реальными обстоятельствами. Знак — тема для размышления, а не доказательство будущего.`,
        },
        {
          q: "Нужна дата рождения?",
          a: "Для расклада Таро дата рождения не обязательна. Важнее вопрос, период и контекст ситуации; данные профиля можно добавить по желанию.",
        },
      ]}
      extraSections={[
        {
          heading: `На что обратить внимание при раскладе для ${sign.nameGenitive}`,
          body: sign.readingFocus,
        },
        {
          heading: "Пример вопроса к картам",
          body: `«${sign.exampleQuestion}» Такой вопрос относится к вашему решению, поэтому расклад можно сверить с действием, а не ждать абстрактного события.`,
        },
        {
          heading: "Как не ошибиться в трактовке",
          body: sign.interpretation,
        },
      ]}
    />
  );
}
