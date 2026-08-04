import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { HD_PAIR_SEO } from "@/lib/human-design/seo-compatibility";

export const metadata: Metadata = buildSeoMetadata({
  title: "Совместимость по Дизайну Человека — рассчитать совместимость пары бесплатно",
  description:
    "Совместимость в Дизайне Человека: композитный бодиграф пары, электромагнетические каналы, динамика всех пар типов — Генератор, Манифестор, Проектор, Рефлектор. Расчёт бесплатно онлайн.",
  path: "/dizayn-cheloveka/sovmestimost",
});

const HUB_FAQ = [
  {
    q: "Как Дизайн Человека оценивает совместимость?",
    a: "Две карты накладываются друг на друга в композит: смотрятся электромагнетические каналы (притяжение), определение центров (как вы влияете друг на друга) и темы компромиссов. Типы задают общий стиль пары, но решает композит.",
  },
  {
    q: "Бывают ли несовместимые типы?",
    a: "Нет. Любая пара типов может построить гармоничные отношения, если оба живут свою стратегию и авторитет. «Сложные» сочетания — это просто темы, требующие осознанности.",
  },
  {
    q: "Что такое электромагнетические каналы?",
    a: "Это каналы, которые складываются из половин двух карт: у одного партнёра одни ворота, у другого — вторая половина. Такие каналы дают сильное влечение и одновременно главные уроки пары.",
  },
  {
    q: "Нужно ли знать время рождения партнёра?",
    a: "Желательно: без времени расчёт делается на полдень с проверкой стабильности результата. Тип и большинство каналов обычно не меняются, но точный профиль и авторитет требуют времени.",
  },
];

export default function HdCompatibilityHubPage() {
  const structuredData = buildForecastStructuredData({
    title: "Совместимость по Дизайну Человека",
    description: metadata.description as string,
    path: "/dizayn-cheloveka/sovmestimost",
    faq: HUB_FAQ,
  });

  return (
    <SeoPageShell backHref="/dizayn-cheloveka" backLabel="Дизайн Человека">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_compat_hub_view" params={{}} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека · Совместимость</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Совместимость пары по Дизайну Человека
      </h1>
      <p className="mt-4 text-white/70">
        Композитный бодиграф показывает, как две карты складываются в одну систему:
        электромагнетические каналы притяжения, центры, которые вы определяете друг другу,
        и зоны роста пары. Расчёт бесплатный, регистрация не нужна.
      </p>

      <div className="mt-8">
        <SeoTrackedCta
          href="/dizayn-cheloveka/sovmestimost/rasschitat"
          trackGoal="hd_compat_start"
          trackParams={{ from: "hub" }}
        >
          Рассчитать совместимость пары
        </SeoTrackedCta>
      </div>

      <SeoSection title="Совместимость по типам">
        <p>
          Тип — первый слой совместимости: стратегия каждого партнёра задаёт ритм
          отношений. Выберите вашу пару:
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {HD_PAIR_SEO.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/dizayn-cheloveka/sovmestimost/${p.slug}`}
                className="block rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-white/80 transition hover:border-amber-500/40 hover:text-amber-100"
              >
                {p.nameA} + {p.nameB}
              </Link>
            </li>
          ))}
        </ul>
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
          href="/dizayn-cheloveka/sovmestimost/rasschitat"
          trackGoal="hd_compat_start"
          trackParams={{ from: "hub_bottom" }}
        >
          Проверить свою пару бесплатно
        </SeoTrackedCta>
      </div>
    </SeoPageShell>
  );
}
