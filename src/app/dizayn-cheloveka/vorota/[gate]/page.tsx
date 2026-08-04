import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import {
  ALL_GATE_SLUGS,
  CENTER_SEO_SLUGS,
  centerSeo,
  gateSeo,
} from "@/lib/human-design/seo-entities";
import { CENTER_NAMES_RU } from "@/lib/human-design";

export function generateStaticParams() {
  return ALL_GATE_SLUGS.map((gate) => ({ gate }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gate: string }>;
}): Promise<Metadata> {
  const { gate } = await params;
  const seo = gateSeo(Number(gate));
  if (!seo) return { title: "Дизайн Человека" };
  return buildSeoMetadata({
    title: seo.title,
    description: seo.metaDescription,
    path: `/dizayn-cheloveka/vorota/${seo.slug}`,
  });
}

export default async function HdGatePage({
  params,
}: {
  params: Promise<{ gate: string }>;
}) {
  const { gate } = await params;
  const seo = gateSeo(Number(gate));
  if (!seo) notFound();

  const structuredData = buildForecastStructuredData({
    title: seo.title,
    description: seo.metaDescription,
    path: `/dizayn-cheloveka/vorota/${seo.slug}`,
    faq: seo.faq,
  });

  const centerSlug = CENTER_SEO_SLUGS.find((s) => centerSeo(s)?.center === seo.center);

  return (
    <SeoPageShell backHref="/dizayn-cheloveka" backLabel="Дизайн Человека">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_gate_view" params={{ gate: seo.slug }} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека · Ворота</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{seo.title}</h1>
      <p className="mt-4 text-white/70">{seo.intro}</p>

      <p className="mt-4 text-sm text-white/50">
        Центр:{" "}
        {centerSlug ? (
          <a
            href={`/dizayn-cheloveka/centry/${centerSlug}`}
            className="text-amber-200/90 underline decoration-amber-500/40 underline-offset-4 hover:text-amber-100"
          >
            {CENTER_NAMES_RU[seo.center]}
          </a>
        ) : (
          CENTER_NAMES_RU[seo.center]
        )}
      </p>

      <div className="mt-6">
        <SeoTrackedCta
          href="/dizayn-cheloveka/rasschitat"
          trackGoal="hd_calc_start"
          trackParams={{ from: `gate_${seo.slug}` }}
        >
          Проверить свои ворота бесплатно
        </SeoTrackedCta>
      </div>

      {seo.sections.map((section) => (
        <SeoSection key={section.title} title={section.title}>
          <p>{section.body}</p>
        </SeoSection>
      ))}

      <SeoSection title="Частые вопросы">
        <dl className="space-y-4">
          {seo.faq.map((item) => (
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
          trackParams={{ from: `gate_${seo.slug}_bottom` }}
        >
          Рассчитать свою карту
        </SeoTrackedCta>
      </div>
    </SeoPageShell>
  );
}
