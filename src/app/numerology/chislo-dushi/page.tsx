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
  title: "Число души по имени — рассчитать бесплатно | Zovus",
  description:
    "Число души в нумерологии: бесплатный расчёт по гласным имени. Не дата рождения и не матрица судьбы — внутренний мотив, как вы сами себя слышите.",
  path: "/numerology/chislo-dushi",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Нумерология", path: "/numerology" },
  { name: "Число души", path: "/numerology/chislo-dushi" },
];

const faq = [
  {
    q: "Как считается число души?",
    a: "Складываются числовые значения гласных имени в пифагорейской системе и сворачиваются до 1–9 или мастер-числа. Дата рождения здесь не нужна.",
  },
  {
    q: "Какое имя писать?",
    a: "То, которым вас обычно называют. Паспортное и домашнее могут дать разные числа — это не ошибка, а разные роли.",
  },
  {
    q: "Это то же самое, что число судьбы?",
    a: "Нет. Число судьбы (жизненного пути) считается по дате. Число души — по гласным имени. Вместе они дают каркас «кто я» и «чего хочу».",
  },
];

export default function ChisloDushiPage() {
  const structuredData = buildForecastStructuredData({
    title: "Число души по имени",
    description: "Бесплатный расчёт числа души по гласным имени.",
    path: "/numerology/chislo-dushi",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="soul_number_view" />
      <p className="text-sm text-aura-gold/80">Нумерология · Имя</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Число души по имени</h1>
      <p className="mt-4 text-white/70">
        Число души показывает внутренний мотив: чего вы хотите, когда никто не смотрит. Это не
        характер по дате и не арканы матрицы.
      </p>

      <SeoSection title="Рассчитать бесплатно">
        <p className="mb-4 text-sm text-white/60">
          Имя остаётся в браузере на время расчёта и не создаёт расклад.
        </p>
        <NumerologyPublicCalc
          mode="soul"
          goal="soul_number_calc_complete"
          submitLabel="Рассчитать число души"
        />
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/numerology/chislo-sudby" trackGoal="soul_number_cta_click">
          Число пути по дате
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/numerology/rasschitat"
          variant="ghost"
          trackGoal="soul_number_cta_click"
          trackParams={{ target: "bundle" }}
        >
          Путь и год вместе
        </SeoTrackedCta>
      </div>

      <SeoSection title="Дальше">
        <p>
          Полная схема по дате —{" "}
          <Link href="/numerology/destiny-matrix" className="text-aura-gold hover:underline">
            матрица судьбы
          </Link>
          . Совместимость имён — отдельный расчёт, не число души.
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

      <SeoRelatedTools excludeHrefs={["/numerology/chislo-dushi"]} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
