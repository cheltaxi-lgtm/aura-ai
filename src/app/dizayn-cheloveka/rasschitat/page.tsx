import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import HdCalculator from "@/components/human-design/HdCalculator";
import { isHumanDesignEnabled } from "@/lib/settings";

export const metadata: Metadata = buildSeoMetadata({
  title: "Рассчитать карту Дизайна Человека бесплатно — бодиграф онлайн",
  description:
    "Бесплатный онлайн-калькулятор Дизайна Человека: введите дату, время и место рождения — получите тип, стратегию, авторитет, профиль, каналы и интерактивный бодиграф. Без регистрации.",
  path: "/dizayn-cheloveka/rasschitat",
});

const FAQ = [
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
    <SeoPageShell backHref="/dizayn-cheloveka" backLabel="Дизайн Человека">
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
        Укажите данные рождения — расчёт выполняется по точным эфемеридам с истинным
        лунным узлом и моментом Дизайна ровно за 88° солярной дуги до рождения.
      </p>

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

      <p className="mt-8 text-xs leading-relaxed text-white/40">
        Дизайн Человека — система символической интерпретации. Результат не является
        медицинской, юридической или финансовой рекомендацией.
      </p>
    </SeoPageShell>
  );
}
