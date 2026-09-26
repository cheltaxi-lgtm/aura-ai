import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Расклад на сутки онлайн — Таро на сегодня | Zovus",
  description:
    "Один ежедневный расклад на сутки: утро, день и вечер. Бесплатно раз в сутки после входа в Zovus.",
  path: "/gadanie/karta-dnya",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Гадание онлайн", path: "/gadanie" },
  { name: "Расклад на сутки", path: "/gadanie/karta-dnya" },
];

const faq = [
  {
    q: "Что такое расклад на сутки?",
    a: "Это один ежедневный расклад на утро, день и вечер. Он даёт короткий ориентир на ближайшие сутки, а не прогноз на всю жизнь.",
  },
  {
    q: "Чем он отличается от первого расклада?",
    a: "Первый расклад отвечает на ваш вопрос и доступен до регистрации. Расклад на сутки открывается после входа бесплатно раз в сутки; сохранённый результат можно посмотреть снова.",
  },
  {
    q: "Можно ли открыть расклад на сутки бесплатно?",
    a: "Да. После входа один расклад на сутки доступен бесплатно раз в сутки.",
  },
];

export default function GadanieKartaDnyaPage() {
  const structuredData = buildForecastStructuredData({
    title: "Расклад на сутки онлайн",
    description:
      "Один ежедневный расклад на утро, день и вечер после входа в Zovus.",
    path: "/gadanie/karta-dnya",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="gadanie_karta_dnya_view" />
      <p className="text-sm text-aura-gold/80">Гадание онлайн · Расклад на сутки</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Расклад на сутки онлайн</h1>
      <p className="mt-4 text-white/70">
        На Zovus есть один ежедневный расклад — «Расклад на сутки». Он помогает посмотреть на утро,
        день и вечер. Первый расклад по вашему вопросу остаётся отдельным знакомством с сервисом.
      </p>

      <SeoSection title="Как работает расклад на сутки">
        <div className="grid gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">Один расклад на сегодня</p>
            <p className="mt-1 text-sm text-white/70">
              Утро, день и вечер — короткий ориентир на ближайшие сутки. После входа он доступен
              бесплатно раз в сутки; сегодняшний результат сохраняется.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">Первый расклад по вопросу</p>
            <p className="mt-1 text-sm text-white/70">
              Три карты до регистрации по вашей формулировке. Это знакомство с сервисом, а не карта
              дня. После входа те же карты открываются полностью — без повторного выбора.
            </p>
          </div>
        </div>
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/?daily=1" trackGoal="gadanie_karta_dnya_cta_click" trackParams={{ target: "daily_reading" }}>
          Открыть расклад на сутки
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/?ask=1&spread=1"
          variant="ghost"
          trackGoal="gadanie_karta_dnya_cta_click"
          trackParams={{ target: "first_reading" }}
        >
          Попробовать первый расклад
        </SeoTrackedCta>
      </div>

      <SeoSection title="Как читать расклад на сутки">
        <p>
          Смотрите на расклад как на ориентир: что начать утром, чему уделить внимание днём и с чем
          завершить вечер. Конкретный вопрос об отношениях или работе лучше задать в отдельном
          тематическом раскладе.
        </p>
        <p>
          Полезно вернуться к сохранённому результату вечером и сравнить его с тем, как прошёл день.
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

      <SeoRelatedTools
        links={[
          { href: "/statyi/karta-dnya", label: "Статья: карта дня" },
          { href: "/gadanie/besplatno", label: "Гадание бесплатно" },
          { href: "/taro", label: "Таро онлайн" },
          { href: "/goroskop-na-segodnya", label: "Гороскоп на сегодня" },
          { href: "/rasklady/na-segodnya", label: "Расклад на сегодня" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
