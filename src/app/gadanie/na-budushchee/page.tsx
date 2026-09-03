import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Гадание на будущее онлайн — Таро, гороскоп и личный год | Zovus",
  description:
    "Гадание на будущее: расклады Таро на перспективу, гороскоп на сегодня и личный год по дате. Не предсказание дат — ориентир на ближайший шаг. Zovus.",
  path: "/gadanie/na-budushchee",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Гадание онлайн", path: "/gadanie" },
  { name: "На будущее", path: "/gadanie/na-budushchee" },
];

const METHODS = [
  {
    href: "/rasklady/budushchee",
    title: "Таро на будущее",
    text: "Каталог раскладов про перспективу, неделю и «что дальше» — не гороскоп на 12 знаков.",
  },
  {
    href: "/goroskop-na-segodnya",
    title: "Гороскоп на сегодня",
    text: "Честный шаблон по знаку и переход к наталу, если есть время и место.",
  },
  {
    href: "/numerology/lichnyy-god",
    title: "Личный год",
    text: "Числовой фон календарного года по дате рождения — не события по дням.",
  },
  {
    href: "/taro/tri-karty",
    title: "Три карты по вопросу",
    text: "Первый персональный расклад: прошлое / настоящее / следующий шаг. Это не карта дня.",
  },
] as const;

const faq = [
  {
    q: "Можно ли узнать будущее точно?",
    a: "Нет. На Zovus гадание на будущее — ориентир на ближайший шаг и фон периода, а не календарь событий. Чем конкретнее вопрос, тем полезнее ответ.",
  },
  {
    q: "Чем Таро отличается от гороскопа?",
    a: "Таро отвечает на ваш вопрос тремя или более картами. Гороскоп на сегодня — общий тон знака. Личный год — одно число на календарный год.",
  },
  {
    q: "Это карта дня?",
    a: "Нет. Карта дня — отдельный ритуал. Первый расклад из трёх карт на главной отвечает на вопрос и после входа не перетягивается.",
  },
];

export default function GadanieNaBudushcheePage() {
  const structuredData = buildForecastStructuredData({
    title: "Гадание на будущее онлайн",
    description: "Таро на перспективу, гороскоп на сегодня и личный год — выбор формата.",
    path: "/gadanie/na-budushchee",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="gadanie_future_view" />
      <p className="text-sm text-aura-gold/80">Гадание онлайн · Будущее</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Гадание на будущее онлайн</h1>
      <p className="mt-4 text-white/70">
        «Что меня ждёт» почти всегда значит «какой ближайший шаг и какой фон у периода». Ниже —
        разные инструменты, а не одно обещание назвать даты.
      </p>

      <SeoSection title="Выберите формат">
        <div className="grid gap-3">
          {METHODS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
            >
              <p className="font-medium text-white">{item.title}</p>
              <p className="mt-1 text-sm text-white/70">{item.text}</p>
              <p className="mt-2 text-sm text-aura-gold">Открыть →</p>
            </Link>
          ))}
        </div>
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/rasklady/budushchee" trackGoal="gadanie_future_cta_click">
          Расклады на будущее
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/?ask=1&spread=1"
          variant="ghost"
          trackGoal="gadanie_future_cta_click"
          trackParams={{ target: "first" }}
        >
          Первый расклад из трёх карт
        </SeoTrackedCta>
      </div>

      <SeoSection title="Как не смешать форматы">
        <p>
          Гостевой триплет на главной — ответ на ваш вопрос. Карта дня — отдельная страница и
          ежедневный ритуал после входа. Личный год не заменяет натал: для домов нужны время и место.
        </p>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <SeoRelatedTools
        excludeHrefs={["/gadanie/na-budushchee"]}
        extraLinks={[
          { href: "/gadanie/karta-dnya", label: "Карта дня" },
          { href: "/prognoz", label: "Прогнозы" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
