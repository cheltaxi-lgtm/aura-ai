import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import HdCompatibilityCalculator from "@/components/human-design/HdCompatibilityCalculator";
import { isHumanDesignEnabled } from "@/lib/settings";
import { notFound } from "next/navigation";

export const metadata: Metadata = buildSeoMetadata({
  title: "Рассчитать совместимость пары по Дизайну Человека бесплатно",
  description:
    "Композитный бодиграф пары онлайн: введите данные рождения двух человек и увидьте электромагнетические каналы, общие центры и точки притяжения. Бесплатно, без регистрации.",
  path: "/dizayn-cheloveka/sovmestimost/rasschitat",
});

const FAQ = [
  {
    q: "Нужна ли регистрация для расчёта совместимости?",
    a: "Нет, композитный бодиграф пары строится бесплатно и без регистрации. Войти понадобится только для персонального разбора совместимости от Эвелины.",
  },
  {
    q: "Что делать, если не знаю время рождения партнёра?",
    a: "Отметьте «не знаю время» — расчёт будет сделан на полдень с проверкой стабильности. Тип и большинство каналов обычно не меняются в течение дня.",
  },
] as const;

export default async function HdCompatibilityCalcPage() {
  if (!(await isHumanDesignEnabled())) notFound();

  const structuredData = buildForecastStructuredData({
    title: "Рассчитать совместимость пары по Дизайну Человека",
    description: metadata.description as string,
    path: "/dizayn-cheloveka/sovmestimost/rasschitat",
    faq: FAQ.map((item) => ({ q: item.q, a: item.a })),
  });

  return (
    <SeoPageShell
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Дизайн Человека", path: "/dizayn-cheloveka" },
        { name: "Совместимость", path: "/dizayn-cheloveka/sovmestimost" },
        { name: "Рассчитать", path: "/dizayn-cheloveka/sovmestimost/rasschitat" },
      ]}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_compat_calc_view" params={{}} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека · Совместимость</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Композитный бодиграф пары
      </h1>
      <p className="mt-4 text-white/70">
        Введите данные рождения двух человек — сервис построит обе карты и наложит их:
        бирюзовым подсвечены электромагнетические каналы притяжения и ворота партнёра.
      </p>

      <div className="mt-8">
        <HdCompatibilityCalculator />
      </div>

      <SeoSection title="Что вы увидите в композите">
        <ul className="list-disc space-y-2 pl-5 text-white/75">
          <li>Объединённый бодиграф: какие центры определяются в паре.</li>
          <li>Электромагнетические каналы — точки искры и главные уроки отношений.</li>
          <li>Ворота партнёра на вашей карте — где вы дополняете друг друга.</li>
          <li>Разбор совместимости от Эвелины — перевод механики на язык вашей жизни.</li>
        </ul>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        <div className="space-y-4">
          {FAQ.map((item) => (
            <div key={item.q}>
              <p className="font-medium text-amber-50">{item.q}</p>
              <p className="mt-1 text-white/70">{item.a}</p>
            </div>
          ))}
        </div>
      </SeoSection>
    </SeoPageShell>
  );
}
