import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import {
  HD_PAIR_SLUGS,
  HD_PAIR_SEO,
  hdPairSeoBySlug,
  hdTypeSlug,
} from "@/lib/human-design/seo-compatibility";
import { TYPE_META } from "@/lib/human-design";

export function generateStaticParams() {
  return HD_PAIR_SLUGS.map((pair) => ({ pair }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pair: string }>;
}): Promise<Metadata> {
  const { pair } = await params;
  const seo = hdPairSeoBySlug(pair);
  if (!seo) return { title: "Совместимость в Дизайне Человека" };
  return buildSeoMetadata({
    title: seo.title,
    description: seo.metaDescription,
    path: `/dizayn-cheloveka/sovmestimost/${seo.slug}`,
  });
}

export default async function HdPairPage({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair } = await params;
  const seo = hdPairSeoBySlug(pair);
  if (!seo) notFound();

  const metaA = TYPE_META[seo.typeA];
  const metaB = TYPE_META[seo.typeB];
  const structuredData = buildForecastStructuredData({
    title: seo.title,
    description: seo.metaDescription,
    path: `/dizayn-cheloveka/sovmestimost/${seo.slug}`,
    faq: seo.faq,
  });

  const others = HD_PAIR_SEO.filter((p) => p.slug !== seo.slug).slice(0, 6);

  return (
    <SeoPageShell
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Дизайн Человека", path: "/dizayn-cheloveka" },
        { name: "Совместимость", path: "/dizayn-cheloveka/sovmestimost" },
        {
          name: `${seo.nameA} + ${seo.nameB}`,
          path: `/dizayn-cheloveka/sovmestimost/${seo.slug}`,
        },
      ]}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_pair_view" params={{ pair: seo.slug }} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека · Совместимость</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        {seo.nameA} + {seo.nameB}
      </h1>
      <p className="mt-4 text-white/70">{seo.intro}</p>

      <dl className="mt-6 grid grid-cols-2 gap-2.5 text-sm">
        <Link
          href={`/dizayn-cheloveka/tipy/${hdTypeSlug(seo.typeA)}`}
          className="rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition hover:border-amber-500/40"
        >
          <dt className="text-[0.625rem] uppercase tracking-wider text-amber-100/50">
            {seo.nameA}
          </dt>
          <dd className="mt-1 font-semibold text-amber-50">{metaA.strategyRu}</dd>
        </Link>
        <Link
          href={`/dizayn-cheloveka/tipy/${hdTypeSlug(seo.typeB)}`}
          className="rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition hover:border-amber-500/40"
        >
          <dt className="text-[0.625rem] uppercase tracking-wider text-amber-100/50">
            {seo.nameB}
          </dt>
          <dd className="mt-1 font-semibold text-amber-50">{metaB.strategyRu}</dd>
        </Link>
      </dl>

      <div className="mt-6">
        <SeoTrackedCta
          href="/dizayn-cheloveka/sovmestimost/rasschitat"
          trackGoal="hd_compat_start"
          trackParams={{ from: `pair_${seo.slug}` }}
        >
          Проверить совместимость вашей пары
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

      <SeoSection title="Другие пары">
        <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {others.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/dizayn-cheloveka/sovmestimost/${p.slug}`}
                className="text-white/70 underline-offset-4 transition hover:text-amber-200 hover:underline"
              >
                {p.nameA} + {p.nameB}
              </Link>
            </li>
          ))}
        </ul>
      </SeoSection>

      <div className="mt-10">
        <SeoTrackedCta
          href="/dizayn-cheloveka/sovmestimost/rasschitat"
          trackGoal="hd_compat_start"
          trackParams={{ from: `pair_${seo.slug}_bottom` }}
        >
          Рассчитать совместимость бесплатно
        </SeoTrackedCta>
      </div>
    </SeoPageShell>
  );
}
