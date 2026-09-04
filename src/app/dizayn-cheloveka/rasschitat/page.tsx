import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import HdCalculator from "@/components/human-design/HdCalculator";
import { isHumanDesignEnabled } from "@/lib/settings";
import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";

export const metadata: Metadata = buildSeoMetadata({
  title: "Рассчитать карту Дизайна Человека бесплатно — бодиграф онлайн",
  description:
    "Бесплатный онлайн-калькулятор Дизайна Человека: введите дату, время и место рождения — получите тип, стратегию, авторитет, профиль, каналы и интерактивный бодиграф. Без регистрации.",
  path: "/dizayn-cheloveka/rasschitat",
});

const FAQ = [
  {
    q: "Можно ли рассчитать карту только по дате рождения?",
    a: "Да: дата определяет основные активации, но без времени и места точность ниже. Калькулятор построит карту на 12:00 и отдельно покажет, какие параметры стабильны в течение дня, а какие зависят от времени рождения.",
  },
  {
    q: "Нужна ли регистрация для расчёта?",
    a: "Нет. Тип, стратегия, авторитет, профиль и бодиграф доступны бесплатно без аккаунта. Войти понадобится только для полного письменного разбора.",
  },
  {
    q: "Что делать, если не знаю точное время рождения?",
    a: "Отметьте «не знаю время» — расчёт будет на 12:00 с проверкой, какие параметры стабильны в течение дня, а какие зависят от времени.",
  },
  {
    q: "Насколько точен калькулятор?",
    a: "Позиции планет считаются по точным эфемеридам, момент Дизайна — ровно 88° солярной дуги до рождения, лунный узел — истинный.",
  },
] as const;

export default async function HumanDesignCalculatePage() {
  if (!(await isHumanDesignEnabled())) notFound();

  const structuredData = buildForecastStructuredData({
    title: "Рассчитать карту Дизайна Человека бесплатно",
    description: metadata.description as string,
    path: "/dizayn-cheloveka/rasschitat",
    faq: FAQ.map((item) => ({ q: item.q, a: item.a })),
  });

  return (
    <SeoPageShell
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Дизайн Человека", path: "/dizayn-cheloveka" },
        { name: "Рассчитать карту", path: "/dizayn-cheloveka/rasschitat" },
      ]}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker
        goal="hd_calc_view"
        params={{}}
        funnelProduct="human_design"
        funnelSource="hd_calc"
      />
      <p className="text-sm text-aura-gold/80">Дизайн Человека · Калькулятор</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Рассчитать карту Дизайна Человека
      </h1>
      <p className="mt-4 text-white/70">
        Узнайте свой тип, стратегию и внутренний авторитет по данным рождения.
        Карта и основные параметры — бесплатно, без регистрации.
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-white/55">
        <li>Профиль и интерактивный бодиграф с воротами, каналами и центрами.</li>
        <li>Полный письменный разбор — отдельно после входа, {DEFAULT_RUNE_COSTS.HD_REPORT} ᚢ.</li>
      </ul>

      <div className="mt-8">
        <HdCalculator returnTo="/dizayn-cheloveka/rasschitat" />
      </div>

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

      <SeoRelatedTools
        title="Смотрите также"
        links={[
          { href: "/dizayn-cheloveka", label: "Что такое Дизайн Человека" },
          { href: "/dizayn-cheloveka/sovmestimost", label: "Совместимость пары" },
          { href: "/dizayn-cheloveka/vorota", label: "64 ворота — справочник" },
          { href: "/dizayn-cheloveka/kanaly", label: "36 каналов — справочник" },
          { href: "/natalnaya-karta", label: "Натальная карта" },
          { href: "/numerology/destiny-matrix", label: "Матрица судьбы" },
        ]}
      />

      <p className="mt-8 text-xs leading-relaxed text-white/40">
        Дизайн Человека — система символической интерпретации. Результат не является
        медицинской, юридической или финансовой рекомендацией.
      </p>
    </SeoPageShell>
  );
}
