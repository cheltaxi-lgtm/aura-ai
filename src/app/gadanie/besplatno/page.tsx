import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Что входит в бесплатное гадание онлайн | Zovus",
  description:
    "Что доступно бесплатно на Zovus: первый расклад из трёх карт без регистрации, 3 карты дня после входа, калькуляторы матрицы, натала и числа пути.",
  path: "/gadanie/besplatno",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Гадание онлайн", path: "/gadanie" },
  { name: "Бесплатно", path: "/gadanie/besplatno" },
];

const FREE_ITEMS = [
  {
    title: "Первый расклад из трёх карт",
    text: "Без регистрации и без банковской карты: вопрос → три карты → короткий намёк → полный разбор тех же карт после входа.",
    href: "/?ask=1&spread=1",
    cta: "Открыть первый расклад",
  },
  {
    title: "3 карты дня",
    text: "После регистрации — короткий ориентир раз в сутки. Это не первый гостевой расклад и не «карта дня» в одну позицию.",
    href: "/gadanie/karta-dnya",
    cta: "Как устроены карты дня",
  },
  {
    title: "Матрица судьбы",
    text: "Схема по дате рождения на 22 арканах — расчёт сразу на экране, без аккаунта.",
    href: "/numerology/destiny-matrix",
    cta: "Рассчитать матрицу",
  },
  {
    title: "Натальная карта",
    text: "Публичный расчёт по дате, времени и месту рождения — затем полный разбор в кабинете.",
    href: "/natalnaya-karta",
    cta: "Построить карту",
  },
  {
    title: "Дизайн человека",
    text: "Тип, стратегия и центры по дате, времени и месту — калькулятор без оплаты за расчёт.",
    href: "/dizayn-cheloveka/rasschitat",
    cta: "Рассчитать бодиграф",
  },
  {
    title: "Число жизненного пути",
    text: "Одно число по дате рождения и короткий смысл — без регистрации.",
    href: "/numerology/chislo-sudby",
    cta: "Узнать число пути",
  },
] as const;

const faq = [
  {
    q: "Можно ли гадать онлайн бесплатно без регистрации?",
    a: "Да: первый расклад из трёх карт открывается до аккаунта. Калькуляторы матрицы, натала, дизайна человека и числа пути тоже считают без входа. Полные сессии с мастером — по тарифу в рунах.",
  },
  {
    q: "Что платное?",
    a: "Развёрнутый диалог с мастером, повторные расклады сверх бесплатного лимита, полные отчёты матрицы и натала, фото-расклад и хиромантия после тизера. На старте банковская карта не нужна.",
  },
  {
    q: "Бесплатный расклад и карта дня — это одно и то же?",
    a: "Нет. Первый расклад отвечает на ваш вопрос. Карта дня и 3 карты дня — ритуал на сегодня. Подробнее — на странице «Карта дня».",
  },
];

export default function GadanieBesplatnoPage() {
  const structuredData = buildForecastStructuredData({
    title: "Что входит в бесплатное гадание онлайн",
    description:
      "Что доступно бесплатно на Zovus: первый расклад, карты дня, матрица, натал и число пути.",
    path: "/gadanie/besplatno",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="gadanie_besplatno_view" />
      <p className="text-sm text-aura-gold/80">Гадание онлайн · Бесплатно</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Что входит в бесплатное гадание онлайн</h1>
      <p className="mt-4 text-white/70">
        Бесплатно — это не «весь сервис без ограничений», а честный старт: первый персональный
        расклад, ежедневный ритуал после входа и калькуляторы без аккаунта. Ниже — что именно
        открывается без оплаты и где начинается сессия с мастером.
      </p>

      <SeoSection title="Что открывается без оплаты">
        <div className="grid gap-3">
          {FREE_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
            >
              <p className="font-medium text-white">{item.title}</p>
              <p className="mt-1 text-sm text-white/70">{item.text}</p>
              <p className="mt-2 text-sm text-aura-gold">{item.cta} →</p>
            </Link>
          ))}
        </div>
      </SeoSection>

      <div className="mt-8">
        <SeoTrackedCta href="/?ask=1&spread=1" trackGoal="gadanie_besplatno_cta_click">
          Открыть первый расклад бесплатно
        </SeoTrackedCta>
      </div>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <SeoRelatedTools
        excludeHrefs={["/gadanie", "/gadanie/besplatno"]}
        extraLinks={[
          { href: "/gadanie/da-net", label: "Гадание да или нет" },
          { href: "/gadanie/karta-dnya", label: "Карта дня" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
