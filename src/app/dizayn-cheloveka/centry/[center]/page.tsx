import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { CENTER_SEO_SLUGS, centerSeo } from "@/lib/human-design/seo-entities";
import { GATE_CENTERS, GATE_NAMES_RU } from "@/lib/human-design";

export function generateStaticParams() {
  return CENTER_SEO_SLUGS.map((center) => ({ center }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ center: string }>;
}): Promise<Metadata> {
  const { center } = await params;
  const seo = centerSeo(center);
  if (!seo) return { title: "Дизайн Человека" };
  return buildSeoMetadata({
    title: seo.title,
    description: seo.metaDescription,
    path: `/dizayn-cheloveka/centry/${seo.slug}`,
  });
}

export default async function HdCenterPage({
  params,
}: {
  params: Promise<{ center: string }>;
}) {
  const { center } = await params;
  const seo = centerSeo(center);
  if (!seo) notFound();

  const structuredData = buildForecastStructuredData({
    title: seo.title,
    description: seo.metaDescription,
    path: `/dizayn-cheloveka/centry/${seo.slug}`,
    faq: seo.faq,
  });

  const gates = Object.entries(GATE_CENTERS)
    .filter(([, c]) => c === seo.center)
    .map(([g]) => Number(g));

  return (
    <SeoPageShell backHref="/dizayn-cheloveka" backLabel="Дизайн Человека">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_center_view" params={{ center: seo.slug }} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека · Центры</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{seo.title}</h1>
      <p className="mt-4 text-white/70">{seo.intro}</p>

      <div className="mt-6">
        <SeoTrackedCta
          href="/dizayn-cheloveka/rasschitat"
          trackGoal="hd_calc_start"
          trackParams={{ from: `center_${seo.slug}` }}
        >
          Узнать свои центры бесплатно
        </SeoTrackedCta>
      </div>

      <SeoSection title="Если центр определён">
        <p>{seo.definedBody}</p>
      </SeoSection>

      <SeoSection title="Если центр открыт">
        <p>{seo.openBody}</p>
      </SeoSection>

      <SeoSection title="Ворота этого центра">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {gates.map((g) => (
            <li key={g}>
              <a
                href={`/dizayn-cheloveka/vorota/${g}`}
                className="block rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-amber-100/90 transition hover:border-amber-500/40"
              >
                {g} · {GATE_NAMES_RU[g]}
              </a>
            </li>
          ))}
        </ul>
      </SeoSection>

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
          trackParams={{ from: `center_${seo.slug}_bottom` }}
        >
          Рассчитать свою карту
        </SeoTrackedCta>
      </div>
    </SeoPageShell>
  );
}
