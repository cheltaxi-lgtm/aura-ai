import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import LifePathPreview from "@/components/numerolog/LifePathPreview";

export const metadata: Metadata = buildSeoMetadata({
  title: "Число судьбы по дате рождения — рассчитать бесплатно | Zovus",
  description:
    "Число жизненного пути по дате рождения: бесплатный расчёт, значение чисел 1–9 и мастер-чисел 11, 22, 33. Дальше — матрица судьбы и разбор с Эвелиной.",
  path: "/numerology/chislo-sudby",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Нумерология", path: "/numerology" },
  { name: "Число судьбы", path: "/numerology/chislo-sudby" },
];

const faq = [
  {
    q: "Как рассчитать число жизненного пути?",
    a: "Сложите все цифры даты рождения и сверните сумму до числа 1–9, сохраняя мастер-числа 11, 22 и 33. На этой странице расчёт делает та же методика, что и в сессии с Эвелиной.",
  },
  {
    q: "Число судьбы и число пути — это одно и то же?",
    a: "В разговорной речи «число судьбы» часто имеют в виду число жизненного пути по дате. Число судьбы по имени считается отдельно. Здесь — путь по дате; имя и квадрат Пифагора — на соседних страницах.",
  },
  {
    q: "Чем число пути отличается от матрицы судьбы?",
    a: "Число пути — одно число-каркас. Матрица судьбы раскладывает дату на 22 аркана и зоны (комфорт, любовь, деньги, хвост). Начните с числа, затем откройте схему.",
  },
];

export default function ChisloSudbyPage() {
  const structuredData = buildForecastStructuredData({
    title: "Число судьбы по дате рождения",
    description:
      "Бесплатный расчёт числа жизненного пути по дате рождения и значение чисел 1–9, 11, 22, 33.",
    path: "/numerology/chislo-sudby",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="life_path_landing_view" />
      <p className="text-sm text-aura-gold/80">Нумерология · Число пути</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Число судьбы по дате рождения</h1>
      <p className="mt-4 text-white/70">
        Число жизненного пути — короткий каркас «как вы идёте по жизни». Это не приговор и не замена
        матрицы или натальной карты: одно число помогает увидеть стиль, а не расписать каждый год.
      </p>

      <SeoSection title="Рассчитать бесплатно">
        <p className="mb-4 text-sm text-white/60">
          Дата остаётся в браузере на время расчёта и не создаёт расклад и не списывает руны.
        </p>
        <LifePathPreview />
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/numerology/destiny-matrix" trackGoal="life_path_cta_click">
          Открыть матрицу судьбы
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/?numerolog=1"
          variant="ghost"
          trackGoal="life_path_cta_click"
          trackParams={{ target: "evelina" }}
        >
          Разобрать с Эвелиной
        </SeoTrackedCta>
      </div>

      <SeoSection title="Что дальше после числа">
        <ul className="space-y-2 text-sm text-white/70">
          <li>
            <Link href="/numerology/destiny-matrix" className="text-aura-gold hover:underline">
              Матрица судьбы
            </Link>{" "}
            — схема на 22 арканах по той же дате.
          </li>
          <li>
            <Link href="/numerology/pythagoras-square" className="text-aura-gold hover:underline">
              Квадрат Пифагора
            </Link>{" "}
            — ячейки характера и потенциала.
          </li>
          <li>
            <Link href="/natalnaya-karta" className="text-aura-gold hover:underline">
              Натальная карта
            </Link>{" "}
            — планетарный слой, если есть время и место рождения.
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

      <SeoRelatedTools
        excludeHrefs={["/numerology/chislo-sudby"]}
        extraLinks={[{ href: "/numerology/destiny-matrix", label: "Матрица судьбы" }]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
