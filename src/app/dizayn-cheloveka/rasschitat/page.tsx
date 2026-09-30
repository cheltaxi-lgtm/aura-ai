import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
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
      wide
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
      <div className="hd-calc-premium">
        <section className="hd-calc-premium__hero">
          <div>
            <p className="hd-hub-eyebrow">Дизайн Человека · Бесплатный расчёт</p>
            <h1>Рассчитать карту Дизайна Человека</h1>
            <p>Введите дату, время и место рождения. Вы сразу увидите свой тип, стратегию, авторитет, профиль и интерактивный бодиграф. Карта и основные параметры — бесплатно, без регистрации.</p>
          </div>
          <aside className="hd-calc-premium__aside">
            <div className="hd-calc-premium__steps" aria-label="Шаги расчёта">
              <span>01 · Данные рождения</span>
              <span>02 · Бесплатная карта</span>
              <span>03 · Изучайте в своём темпе</span>
            </div>
            <p>Не знаете время рождения? Отметьте это в форме: покажем, какие параметры могут меняться.</p>
            <p>Полный письменный разбор и диалог доступны отдельно после входа; стоимость показывается до заказа.</p>
          </aside>
        </section>

        <div className="hd-calc-premium__workspace">
          <HdCalculator returnTo="/dizayn-cheloveka/rasschitat" />
        </div>

        <section className="hd-calc-premium__after" aria-labelledby="hd-calc-faq-title">
          <p className="hd-hub-eyebrow">Перед расчётом</p>
          <h2 id="hd-calc-faq-title" className="text-3xl">Частые вопросы</h2>
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
          <p className="mt-5 text-sm text-white/55">Ваши сохранённые карты можно снова открыть в <Link href="/dizayn-cheloveka#hd-my-charts" className="text-amber-200 underline-offset-4 hover:underline">разделе «Мои карты»</Link>.</p>
        </section>
      </div>

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
