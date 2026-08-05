import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { CENTER_SEO_SLUGS, centerSeo } from "@/lib/human-design/seo-entities";
import { isHumanDesignEnabled } from "@/lib/settings";

export const metadata: Metadata = buildSeoMetadata({
  title: "9 центров Дизайна Человека — определённые и открытые",
  description:
    "Девять центров бодиграфа: определённый центр — стабильная сила, открытый — место гибкости и мудрости. Разборы всех центров Дизайна Человека.",
  path: "/dizayn-cheloveka/centry",
});

const FAQ = [
  {
    q: "Что значит определённый центр?",
    a: "Определённый (закрашенный) центр — стабильная энергия, которая работает изнутри. Это ваши устойчивые силы и способ принимать решения в этой теме.",
  },
  {
    q: "Что значит открытый центр?",
    a: "Открытый центр усиливает и отражает чужую энергию. Это зона обучения и гибкости — важно не принимать чужое давление за своё.",
  },
] as const;

export default async function HdCentersIndexPage() {
  if (!(await isHumanDesignEnabled())) notFound();

  const structuredData = buildForecastStructuredData({
    title: "9 центров Дизайна Человека",
    description: metadata.description as string,
    path: "/dizayn-cheloveka/centry",
    faq: FAQ.map((item) => ({ q: item.q, a: item.a })),
  });

  return (
    <SeoPageShell backHref="/dizayn-cheloveka" backLabel="Дизайн Человека">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_centers_index_view" params={{}} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека · Центры</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Девять центров
      </h1>
      <p className="mt-4 text-white/70">
        Центры — энергетические узлы бодиграфа. Выберите центр, чтобы понять, что
        даёт определённость и чему учит открытость.
      </p>

      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
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
          trackParams={{ from: "centers_index" }}
        >
          Рассчитать карту и увидеть свои центры
        </SeoTrackedCta>
      </div>
    </SeoPageShell>
  );
}
