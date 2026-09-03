import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Синастрия онлайн — совместимость натальных карт | Zovus",
  description:
    "Синастрия и совместимость натальных карт: две даты, время и место — где пара усиливает друг друга и где трение. Не процент любви. Zovus.",
  path: "/natalnaya-karta/sovmestimost",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Натальная карта", path: "/natalnaya-karta" },
  { name: "Синастрия", path: "/natalnaya-karta/sovmestimost" },
];

const faq = [
  {
    q: "Что такое синастрия?",
    a: "Это сравнение двух натальных карт: аспекты между планетами партнёров, дома и повторяющиеся темы. Это карта взаимных акцентов, а не «процент любви».",
  },
  {
    q: "Чем синастрия отличается от совместимости знаков?",
    a: "Знаки Солнца делят людей на 12 групп. Синастрия смотрит Луну, асцендент, Венеру, Марс и дома — поэтому два «Лев + Рак» живут по-разному.",
  },
  {
    q: "Нужно ли точное время обоих?",
    a: "Для домов и асцендентов — да. Если время одного неизвестно, честнее разбирать планеты в знаках, чем угадывать минуту.",
  },
];

export default function NatalSovmestimostPage() {
  const structuredData = buildForecastStructuredData({
    title: "Синастрия — совместимость натальных карт",
    description: "Совместимость по двум натальным картам: усиление, трение и темы пары.",
    path: "/natalnaya-karta/sovmestimost",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="natal_synastry_view" />
      <p className="text-sm text-aura-gold/80">Астрология · Пара</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Синастрия — совместимость натальных карт</h1>
      <p className="mt-4 text-white/70">
        Синастрия отвечает на «как мы звучим вместе», а не на «подойдём ли навсегда». Две карты
        показывают, где пара кормит друг друга и где нужны договорённости. Если нужны только числа —
        рядом матрица совместимости.
      </p>

      <SeoSection title="Что сравнить">
        <div className="grid gap-3">
          <Link
            href="/natalnaya-karta"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Две натальные карты</p>
            <p className="mt-1 text-sm text-white/70">
              Сначала постройте свою карту бесплатно, затем откройте совместимость по данным партнёра.
            </p>
            <p className="mt-2 text-sm text-aura-gold">К калькулятору натала →</p>
          </Link>
          <Link
            href="/numerology/matrica-sovmestimosti"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Совместимость матриц</p>
            <p className="mt-1 text-sm text-white/70">
              Две даты без времени: оценка Zovus по зонам любви, денег и напряжения.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Сравнить матрицы →</p>
          </Link>
          <Link
            href="/sovmestimost-znakov-zodiaka"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Совместимость знаков</p>
            <p className="mt-1 text-sm text-white/70">
              Короткий вход по Солнцу — не замена синастрии.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Знаки зодиака →</p>
          </Link>
        </div>
      </SeoSection>

      <div className="mt-8">
        <SeoTrackedCta href="/natalnaya-karta" trackGoal="natal_synastry_cta_click">
          Построить натальную карту
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
        excludeHrefs={["/natalnaya-karta/sovmestimost"]}
        extraLinks={[
          { href: "/natal-ili-matrica", label: "Натал или матрица" },
          { href: "/dizayn-cheloveka/sovmestimost", label: "Совместимость в Дизайне человека" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
