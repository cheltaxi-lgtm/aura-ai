import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Натальная карта или матрица судьбы — что выбрать | Zovus",
  description:
    "Чем натальная карта отличается от матрицы судьбы: планеты против 22 арканов. Когда начать с натала, когда с матрицы — и как сочетать оба расчёта на Zovus.",
  path: "/natal-ili-matrica",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Натал или матрица", path: "/natal-ili-matrica" },
];

const faq = [
  {
    q: "Матрица судьбы и натальная карта — это одно и то же?",
    a: "Нет. Натал — снимок неба в момент рождения. Матрица — нумерологическая схема по дате на 22 арканах. Разные исходные данные и разные языки.",
  },
  {
    q: "С чего начать, если есть только дата?",
    a: "С матрицы: время и город не нужны. Натал без времени тоже можно построить как солнечную карту, но дома и асцендент будут неполными.",
  },
  {
    q: "Можно ли делать оба расчёта?",
    a: "Да. Сначала каркас по числам, затем планетарный слой — или наоборот, если вопрос про периоды и дома.",
  },
];

export default function NatalIliMatricaPage() {
  const structuredData = buildForecastStructuredData({
    title: "Натальная карта или матрица судьбы",
    description: "Чем отличаются натал и матрица судьбы и с чего начать на Zovus.",
    path: "/natal-ili-matrica",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="natal_or_matrix_view" />
      <p className="text-sm text-aura-gold/80">Сравнение практик</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Натальная карта или матрица судьбы — что выбрать</h1>
      <p className="mt-4 text-white/70">
        Запрос «чем отличается матрица от натала» почти всегда значит: «с чего начать, чтобы не
        заплатить дважды за одно и то же». Это не одно и то же. Ниже — честная развилка, без «что
        точнее».
      </p>

      <SeoSection title="Коротко">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">Матрица судьбы</p>
            <p className="mt-1 text-sm text-white/70">
              Только дата. 22 аркана, зоны комфорта, любви, денег, кармический хвост. Быстрый каркас
              «кто я и куда клонит год».
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">Натальная карта</p>
            <p className="mt-1 text-sm text-white/70">
              Дата, время и место. Планеты, дома, аспекты, асцендент. Глубже про периоды, сферы жизни
              и синастрию.
            </p>
          </div>
        </div>
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/numerology/destiny-matrix" trackGoal="natal_or_matrix_cta_click" trackParams={{ target: "matrix" }}>
          Рассчитать матрицу
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/natalnaya-karta"
          variant="ghost"
          trackGoal="natal_or_matrix_cta_click"
          trackParams={{ target: "natal" }}
        >
          Построить натал
        </SeoTrackedCta>
      </div>

      <SeoSection title="Когда что брать">
        <p>
          Есть только дата и вопрос «кто я / какой у меня год» — матрица. Есть время рождения и вопрос
          про дома, работу, брак, переезды — натал. Пара без времени —{" "}
          <Link href="/numerology/matrica-sovmestimosti" className="text-aura-gold hover:underline">
            совместимость матриц
          </Link>
          ; пара с временем —{" "}
          <Link href="/natalnaya-karta/sovmestimost" className="text-aura-gold hover:underline">
            синастрия
          </Link>
          .
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

      <SeoRelatedTools extraLinks={[{ href: "/statyi/natal-ili-matrica-chto-vybrat", label: "Подробная статья" }]} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
