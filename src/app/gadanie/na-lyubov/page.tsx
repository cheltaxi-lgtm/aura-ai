import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Гадание на любовь онлайн — Таро, Ленорман и руны | Zovus",
  description:
    "Гадание на любовь онлайн: Таро на чувства, Ленорман на сюжет, руны на «писать / не писать» и совместимость матриц. Выберите метод под вопрос — Zovus.",
  path: "/gadanie/na-lyubov",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Гадание онлайн", path: "/gadanie" },
  { name: "На любовь", path: "/gadanie/na-lyubov" },
];

const METHODS = [
  {
    href: "/rasklady/lyubov",
    title: "Таро на любовь",
    text: "Чувства, динамика пары, «что он скрывает» — когда ситуация многослойная.",
  },
  {
    href: "/lenormand/na-lyubov",
    title: "Ленорман на любовь",
    text: "Короткий сюжет: встреча, письмо, ревность, чем кончится ближайший шаг.",
  },
  {
    href: "/runy/na-lyubov",
    title: "Руны на любовь",
    text: "Прямой «да / нет / не сейчас» — писать, идти на встречу, отпустить.",
  },
  {
    href: "/numerology/matrica-sovmestimosti",
    title: "Совместимость матриц",
    text: "Две даты без времени: любовь, деньги и напряжение пары на схеме.",
  },
] as const;

const faq = [
  {
    q: "Какое гадание на любовь выбрать?",
    a: "Таро — если нужен разбор чувств. Ленорман — если важен ближайший сюжет. Руны — если вопрос сводится к действию. Матрица — если смотрите пару на годы, а не на неделю.",
  },
  {
    q: "Можно ли гадать на любовь бесплатно?",
    a: "Первый персональный расклад на главной — три карты Таро по вашему вопросу. Это не «карта дня». Полные сессии любви — в каталоге и в чате с мастером.",
  },
  {
    q: "Чем это отличается от совместимости знаков?",
    a: "Знаки Солнца делят людей на 12 групп. Здесь методы отвечают на конкретный вопрос пары, а не на шаблон «Овен + Рак».",
  },
];

export default function GadanieNaLyubovPage() {
  const structuredData = buildForecastStructuredData({
    title: "Гадание на любовь онлайн",
    description: "Таро, Ленорман, руны и матрица совместимости — выбор метода под любовный вопрос.",
    path: "/gadanie/na-lyubov",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="gadanie_love_view" />
      <p className="text-sm text-aura-gold/80">Гадание онлайн · Любовь</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Гадание на любовь онлайн — Таро, Ленорман и руны</h1>
      <p className="mt-4 text-white/70">
        Один запрос «гадание на любовь» скрывает разные задачи: понять чувства, увидеть ближайший
        сюжет или решить, писать ли сегодня. Ниже — развилка методов, а не один универсальный расклад.
      </p>

      <SeoSection title="Выберите метод">
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
        <SeoTrackedCta href="/rasklady/lyubov" trackGoal="gadanie_love_cta_click">
          Каталог раскладов на любовь
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/?ask=1&spread=1"
          variant="ghost"
          trackGoal="gadanie_love_cta_click"
          trackParams={{ target: "first" }}
        >
          Первый расклад из трёх карт
        </SeoTrackedCta>
      </div>

      <SeoSection title="Как не смешать форматы">
        <p>
          Первый расклад на главной отвечает на ваш вопрос тремя картами и после входа не
          перетягивается. Это не карта дня и не ежедневный ритуал. Если нужен процент «подойдём ли» —
          честнее матрица или синастрия, чем ещё одна колода.
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
        excludeHrefs={["/gadanie/na-lyubov"]}
        extraLinks={[
          { href: "/natalnaya-karta/sovmestimost", label: "Синастрия" },
          { href: "/sovmestimost-znakov-zodiaka", label: "Совместимость знаков" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
