import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { HD_PROFILE_SEO, HD_TYPE_SEO } from "@/lib/human-design/seo-content";
import {
  ALL_CHANNEL_SLUGS,
  ALL_GATE_SLUGS,
  CENTER_SEO_SLUGS,
  centerSeo,
  channelSeo,
} from "@/lib/human-design/seo-entities";
import { GATE_NAMES_RU } from "@/lib/human-design";
import HdTransitToday from "@/components/human-design/HdTransitToday";

export const metadata: Metadata = buildSeoMetadata({
  title: "Дизайн Человека — рассчитать карту (бодиграф) бесплатно онлайн",
  description:
    "Дизайн Человека онлайн: бесплатный расчёт бодиграфа по дате, времени и месту рождения. Тип, стратегия, авторитет, профиль, каналы и инкарнационный крест. Точные эфемериды, разбор с Эвелиной.",
  path: "/dizayn-cheloveka",
});

const HUB_FAQ = [
  {
    q: "Что такое Дизайн Человека?",
    a: "Система самопознания, соединяющая астрологические расчёты момента рождения, 64 гексаграммы И-Цзина и схему из девяти энергетических центров. Результат — бодиграф: карта вашего типа, стратегии решений, авторитета и профиля.",
  },
  {
    q: "Что нужно для расчёта карты?",
    a: "Дата, время и место рождения. Если время неизвестно, калькулятор построит карту на 12:00 и покажет, какие параметры стабильны в течение дня, а какие зависят от времени.",
  },
  {
    q: "Насколько точен расчёт?",
    a: "Позиции планет считаются по точным эфемеридам (сверено с данными NASA JPL), момент Дизайна — ровно 88° солярной дуги до рождения, лунный узел — истинный. Это соответствует канонической методике расчёта рейв-карт.",
  },
  {
    q: "Расчёт бесплатный?",
    a: "Да: тип, стратегия, авторитет, профиль, определённость, крест и интерактивный бодиграф — бесплатно и без регистрации. Полный письменный разбор с Эвелиной и диалог по карте — платные, после входа.",
  },
  {
    q: "Чем Дизайн Человека отличается от натальной карты?",
    a: "Натальная карта описывает психологию через планеты, знаки и дома. Дизайн Человека — практическая механика: как вам принимать решения (авторитет), куда направлять энергию (тип и стратегия) и какую роль вы играете (профиль). Системы дополняют друг друга.",
  },
] as const;

export default function HumanDesignHubPage() {
  const structuredData = buildForecastStructuredData({
    title: "Дизайн Человека — рассчитать карту бесплатно",
    description:
      "Бесплатный расчёт бодиграфа: тип, стратегия, авторитет, профиль, каналы и инкарнационный крест по точным эфемеридам.",
    path: "/dizayn-cheloveka",
    faq: HUB_FAQ.map((item) => ({ q: item.q, a: item.a })),
  });

  return (
    <SeoPageShell backHref="/" backLabel="На главную">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_hub_view" params={{}} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Дизайн Человека: рассчитать карту бесплатно
      </h1>
      <p className="mt-4 text-white/70">
        Бодиграф — карта вашей механики: тип энергии, стратегия движения по жизни, внутренний
        авторитет для решений, профиль роли и инкарнационный крест. Расчёт занимает секунды
        и не требует регистрации.
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-white/55">
        <li>точные эфемериды, сверенные с данными NASA JPL;</li>
        <li>истинный лунный узел и ровно 88° солярной дуги для момента Дизайна;</li>
        <li>интерактивный бодиграф с пояснениями к воротам, каналам и центрам;</li>
        <li>режим «не знаю время» с проверкой стабильности результата.</li>
      </ul>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta
          href="/dizayn-cheloveka/rasschitat"
          trackGoal="hd_calc_start"
          trackParams={{ from: "hub" }}
        >
          Рассчитать бодиграф бесплатно
        </SeoTrackedCta>
      </div>

      <div className="mt-8">
        <HdTransitToday />
      </div>

      <SeoSection title="Пять типов энергии">
        <p>
          Тип — фундамент Дизайна Человека: как ваша аура взаимодействует с миром и какая
          стратегия снимает сопротивление. Выберите свой тип, чтобы узнать больше:
        </p>
        <ul className="mt-3 space-y-2">
          {HD_TYPE_SEO.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/dizayn-cheloveka/tipy/${t.slug}`}
                className="text-aura-gold underline-offset-4 transition hover:underline"
              >
                {t.title}
              </Link>
              <span className="text-white/50"> — {t.intro.split(".")[0].toLowerCase()}.</span>
            </li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection title="Двенадцать профилей">
        <p>
          Профиль — ваша роль и стиль жизни: две линии из шести, сознательная и
          бессознательная. Все двенадцать профилей:
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
          {HD_PROFILE_SEO.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/dizayn-cheloveka/profili/${p.slug}`}
                className="text-aura-gold underline-offset-4 transition hover:underline"
              >
                {p.profile}
              </Link>
            </li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection title="Девять центров">
        <p>
          Центры — девять энергетических узлов бодиграфа. Определённый центр — ваша
          стабильная сила, открытый — место гибкости и мудрости:
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
          {CENTER_SEO_SLUGS.map((slug) => {
            const seo = centerSeo(slug);
            if (!seo) return null;
            return (
              <li key={slug}>
                <Link
                  href={`/dizayn-cheloveka/centry/${slug}`}
                  className="text-aura-gold underline-offset-4 transition hover:underline"
                >
                  {seo.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </SeoSection>

      <SeoSection title="Шестьдесят четыре ворот и тридцать шесть каналов">
        <p>
          Ворота — 64 темы человеческого опыта, каналы — устойчивые потоки между
          центрами. Найдите свои:
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-aura-gold underline-offset-4 hover:underline">
            Все 64 ворота
          </summary>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
            {ALL_GATE_SLUGS.map((gate) => (
              <li key={gate}>
                <Link
                  href={`/dizayn-cheloveka/vorota/${gate}`}
                  className="text-white/70 underline-offset-4 transition hover:text-amber-200 hover:underline"
                >
                  {gate} · {GATE_NAMES_RU[Number(gate)]}
                </Link>
              </li>
            ))}
          </ul>
        </details>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-aura-gold underline-offset-4 hover:underline">
            Все 36 каналов
          </summary>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
            {ALL_CHANNEL_SLUGS.map((key) => {
              const seo = channelSeo(key);
              if (!seo) return null;
              return (
                <li key={key}>
                  <Link
                    href={`/dizayn-cheloveka/kanaly/${key}`}
                    className="text-white/70 underline-offset-4 transition hover:text-amber-200 hover:underline"
                  >
                    {key} · {seo.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>
      </SeoSection>

      <SeoSection title="Как читать свою карту">
        <ol className="list-decimal space-y-2 pl-5 text-white/75">
          <li>Начните с типа и стратегии — это 70% практической пользы системы.</li>
          <li>Добавьте авторитет: куда именно внутри вас приходит верное решение.</li>
          <li>Посмотрите профиль — он описывает вашу роль и жизненные этапы.</li>
          <li>
            Изучите определённые центры и каналы на бодиграфе — это ваши стабильные силы;
            открытые центры — места гибкости и чужого влияния.
          </li>
        </ol>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        <dl className="space-y-4">
          {HUB_FAQ.map((item) => (
            <div key={item.q}>
              <dt className="font-semibold text-white/90">{item.q}</dt>
              <dd className="mt-1 text-white/70">{item.a}</dd>
            </div>
          ))}
        </dl>
      </SeoSection>

      <div className="mt-10">
        <SeoTrackedCta
          href="/dizayn-cheloveka/rasschitat"
          trackGoal="hd_calc_start"
          trackParams={{ from: "hub_bottom" }}
        >
          Рассчитать свою карту
        </SeoTrackedCta>
      </div>
    </SeoPageShell>
  );
}
