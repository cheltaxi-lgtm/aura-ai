import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { HD_TYPE_SEO } from "@/lib/human-design/seo-content";
import { isHumanDesignEnabled } from "@/lib/settings";

export const metadata: Metadata = buildSeoMetadata({
  title: "Типы Дизайна Человека — генератор, манифестор, проектор, рефлектор",
  description:
    "Пять типов энергии в Дизайне Человека: стратегия, сигнатура и Not-Self. Разборы генератора, манифестирующего генератора, манифестора, проектора и рефлектора.",
  path: "/dizayn-cheloveka/tipy",
});

const FAQ = [
  {
    q: "Сколько типов в Дизайне Человека?",
    a: "Пять: генератор, манифестирующий генератор, манифестор, проектор и рефлектор. Тип определяет стратегию взаимодействия с миром.",
  },
  {
    q: "Как узнать свой тип?",
    a: "Рассчитайте бодиграф по дате, времени и месту рождения — тип определяется автоматически по определению центров и каналов.",
  },
] as const;

export default async function HdTypesIndexPage() {
  if (!(await isHumanDesignEnabled())) notFound();

  const structuredData = buildForecastStructuredData({
    title: "Типы Дизайна Человека",
    description: metadata.description as string,
    path: "/dizayn-cheloveka/tipy",
    faq: FAQ.map((item) => ({ q: item.q, a: item.a })),
  });

  return (
    <SeoPageShell backHref="/dizayn-cheloveka" backLabel="Дизайн Человека">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_types_index_view" params={{}} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека · Типы</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Пять типов энергии
      </h1>
      <p className="mt-4 text-white/70">
        Тип — фундамент карты: как ваша аура взаимодействует с миром и какая стратегия
        снимает сопротивление. Выберите тип, чтобы узнать стратегию, сигнатуру и Not-Self.
      </p>

      <ul className="mt-8 space-y-3">
        {HD_TYPE_SEO.map((t) => (
          <li key={t.slug}>
            <Link
              href={`/dizayn-cheloveka/tipy/${t.slug}`}
              className="text-aura-gold underline-offset-4 transition hover:underline"
            >
              {t.title}
            </Link>
            <span className="text-white/50">
              {" "}
              — {t.intro.split(".")[0].toLowerCase()}.
            </span>
          </li>
        ))}
      </ul>

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

      <div className="mt-10">
        <SeoTrackedCta
          href="/dizayn-cheloveka/rasschitat"
          trackGoal="hd_calc_start"
          trackParams={{ from: "types_index" }}
        >
          Рассчитать свой тип
        </SeoTrackedCta>
      </div>
    </SeoPageShell>
  );
}
