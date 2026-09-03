import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import NumerologyPublicCalc from "@/components/numerolog/NumerologyPublicCalc";

export const metadata: Metadata = buildSeoMetadata({
  title: "Личный год по дате рождения — рассчитать бесплатно | Zovus",
  description:
    "Личный год в нумерологии: бесплатный расчёт по дате рождения на текущий календарный год. Тема года 1–9 и связь с матрицей судьбы.",
  path: "/numerology/lichnyy-god",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Нумерология", path: "/numerology" },
  { name: "Личный год", path: "/numerology/lichnyy-god" },
];

const faq = [
  {
    q: "Как рассчитать личный год?",
    a: "Сложите день и месяц рождения с цифрами текущего календарного года и сверните до 1–9, сохраняя мастер-числа. Здесь считает тот же движок, что в сессии с Эвелиной.",
  },
  {
    q: "Личный год — это гороскоп?",
    a: "Нет. Это числовой фон года по дате, без планет. Для неба нужен натал, для арканов года — матрица.",
  },
  {
    q: "Меняется ли число 1 января?",
    a: "В этой методике личный год привязан к календарному году. Это авторский расчёт Zovus, не «официальный стандарт».",
  },
];

export default function LichnyyGodPage() {
  const structuredData = buildForecastStructuredData({
    title: "Личный год по дате рождения",
    description: "Бесплатный расчёт личного года в нумерологии по дате рождения.",
    path: "/numerology/lichnyy-god",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="personal_year_landing_view" />
      <p className="text-sm text-aura-gold/80">Нумерология · Цикл</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Личный год по дате рождения</h1>
      <p className="mt-4 text-white/70">
        Личный год — фон ближайших месяцев: старт, сбор урожая, пауза или служение. Это не прогноз
        событий по датам и не замена матрицы.
      </p>

      <SeoSection title="Рассчитать бесплатно">
        <p className="mb-4 text-sm text-white/60">
          Дата остаётся в браузере на время расчёта и не создаёт расклад.
        </p>
        <NumerologyPublicCalc
          mode="personal-year"
          goal="personal_year_calc_complete"
          submitLabel="Рассчитать личный год"
        />
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/numerology/destiny-matrix" trackGoal="personal_year_cta_click">
          Открыть матрицу судьбы
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/numerology/rasschitat"
          variant="ghost"
          trackGoal="personal_year_cta_click"
          trackParams={{ target: "bundle" }}
        >
          Путь и год вместе
        </SeoTrackedCta>
      </div>

      <SeoSection title="Дальше">
        <p>
          Число пути —{" "}
          <Link href="/numerology/chislo-sudby" className="text-aura-gold hover:underline">
            каркас характера
          </Link>
          . Матрица покажет аркан года на схеме. Натал — если есть время и место.
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

      <SeoRelatedTools excludeHrefs={["/numerology/lichnyy-god"]} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
