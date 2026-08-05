import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { ALL_GATE_SLUGS } from "@/lib/human-design/seo-entities";
import { GATE_NAMES_RU } from "@/lib/human-design";
import { isHumanDesignEnabled } from "@/lib/settings";

export const metadata: Metadata = buildSeoMetadata({
  title: "64 ворот Дизайна Человека — значения и практика",
  description:
    "Справочник 64 ворот Дизайна Человека: суть, центр и практический смысл каждой темы. Найдите ворота своей карты и прочитайте разбор.",
  path: "/dizayn-cheloveka/vorota",
});

const FAQ = [
  {
    q: "Что такое ворота в Дизайне Человека?",
    a: "Ворота — 64 темы человеческого опыта на бодиграфе. Активированные ворота окрашивают вашу механику; вместе с парными воротами они образуют каналы.",
  },
  {
    q: "Нужно ли знать все 64 ворота?",
    a: "Нет. Начните с ворот вашей карты — они видны на бодиграфе после бесплатного расчёта. Остальные полезны как справочник.",
  },
] as const;

export default async function HdGatesIndexPage() {
  if (!(await isHumanDesignEnabled())) notFound();

  const structuredData = buildForecastStructuredData({
    title: "64 ворот Дизайна Человека",
    description: metadata.description as string,
    path: "/dizayn-cheloveka/vorota",
    faq: FAQ.map((item) => ({ q: item.q, a: item.a })),
  });

  return (
    <SeoPageShell backHref="/dizayn-cheloveka" backLabel="Дизайн Человека">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_gates_index_view" params={{}} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека · Ворота</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Шестьдесят четыре ворот
      </h1>
      <p className="mt-4 text-white/70">
        Ворота — темы опыта на бодиграфе. Выберите номер, чтобы прочитать суть и
        практический смысл.
      </p>

      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
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
          trackParams={{ from: "gates_index" }}
        >
          Рассчитать карту и увидеть свои ворота
        </SeoTrackedCta>
      </div>
    </SeoPageShell>
  );
}
