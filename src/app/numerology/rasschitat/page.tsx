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
  title: "Рассчитать нумерологию по дате рождения бесплатно | Zovus",
  description:
    "Нумерология рассчитать онлайн: число жизненного пути и личный год по дате рождения. Бесплатно, без регистрации. Дальше — матрица судьбы и Эвелина.",
  path: "/numerology/rasschitat",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Нумерология", path: "/numerology" },
  { name: "Рассчитать", path: "/numerology/rasschitat" },
];

const faq = [
  {
    q: "Можно ли рассчитать нумерологию бесплатно?",
    a: "Да. На этой странице считаются число пути и личный год. Полная матрица — на отдельной странице. Диалог с Эвелиной — по тарифу.",
  },
  {
    q: "Чем эта страница отличается от раздела «Нумерология»?",
    a: "Раздел объясняет направления. Здесь — сразу калькулятор по дате, без обзора методов.",
  },
  {
    q: "Нужно ли имя?",
    a: "Для пути и года — нет, достаточно даты. Число души считается по гласным имени на отдельной странице.",
  },
];

export default function NumerologyRasschitatPage() {
  const structuredData = buildForecastStructuredData({
    title: "Рассчитать нумерологию по дате рождения",
    description: "Бесплатный расчёт числа пути и личного года по дате рождения.",
    path: "/numerology/rasschitat",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="numerology_calc_view" />
      <p className="text-sm text-aura-gold/80">Нумерология · Калькулятор</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Рассчитать нумерологию по дате рождения</h1>
      <p className="mt-4 text-white/70">
        Один ввод даты — два числа: как вы идёте по жизни и какой фон у текущего года. Это не вся
        матрица и не натал.
      </p>

      <SeoSection title="Бесплатный расчёт">
        <p className="mb-4 text-sm text-white/60">
          Дата не сохраняется и не списывает руны.
        </p>
        <NumerologyPublicCalc
          mode="bundle"
          goal="numerology_calc_complete"
          submitLabel="Рассчитать путь и год"
        />
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/numerology/destiny-matrix" trackGoal="numerology_calc_cta_click">
          Полная матрица судьбы
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/numerology/chislo-dushi"
          variant="ghost"
          trackGoal="numerology_calc_cta_click"
          trackParams={{ target: "soul" }}
        >
          Число души по имени
        </SeoTrackedCta>
      </div>

      <SeoSection title="Другие расчёты">
        <ul className="space-y-2 text-sm text-white/70">
          <li>
            <Link href="/numerology/pythagoras-square" className="text-aura-gold hover:underline">
              Квадрат Пифагора
            </Link>
          </li>
          <li>
            <Link href="/numerology/compatibility" className="text-aura-gold hover:underline">
              Совместимость по датам
            </Link>
          </li>
          <li>
            <Link href="/natalnaya-karta" className="text-aura-gold hover:underline">
              Натальная карта
            </Link>
          </li>
        </ul>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <SeoRelatedTools excludeHrefs={["/numerology/rasschitat"]} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
