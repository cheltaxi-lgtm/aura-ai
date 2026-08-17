import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { HD_TYPE_SEO, hdTypeSeoBySlug } from "@/lib/human-design/seo-content";
import { TYPE_META } from "@/lib/human-design";

export function generateStaticParams() {
  return HD_TYPE_SEO.map((t) => ({ type: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const seo = hdTypeSeoBySlug(type);
  if (!seo) return { title: "Дизайн Человека" };
  return buildSeoMetadata({
    title: `${seo.title}: стратегия, авторитет, характер`,
    description: seo.metaDescription,
    path: `/dizayn-cheloveka/tipy/${seo.slug}`,
  });
}

export default async function HdTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  const seo = hdTypeSeoBySlug(type);
  if (!seo) notFound();

  const meta = TYPE_META[seo.type];
  const structuredData = buildForecastStructuredData({
    title: seo.title,
    description: seo.metaDescription,
    path: `/dizayn-cheloveka/tipy/${seo.slug}`,
    faq: seo.faq.map((item) => ({ q: item.q, a: item.a })),
  });

  return (
    <SeoPageShell
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Дизайн Человека", path: "/dizayn-cheloveka" },
        { name: "Типы", path: "/dizayn-cheloveka/tipy" },
        { name: seo.title, path: `/dizayn-cheloveka/tipy/${seo.slug}` },
      ]}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_type_view" params={{ type: seo.slug }} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека · Типы</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{seo.title}</h1>
      <p className="mt-4 text-white/70">{seo.intro}</p>

      <dl className="mt-6 grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
          <dt className="text-[0.625rem] uppercase tracking-wider text-amber-100/50">Стратегия</dt>
          <dd className="mt-1 font-semibold text-amber-50">{meta.strategyRu}</dd>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
          <dt className="text-[0.625rem] uppercase tracking-wider text-amber-100/50">Подпись</dt>
          <dd className="mt-1 font-semibold text-amber-50">{meta.signatureRu}</dd>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
          <dt className="text-[0.625rem] uppercase tracking-wider text-amber-100/50">Ложное «я»</dt>
          <dd className="mt-1 font-semibold text-amber-50">{meta.notSelfRu}</dd>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
          <dt className="text-[0.625rem] uppercase tracking-wider text-amber-100/50">Тип</dt>
          <dd className="mt-1 font-semibold text-amber-50">{meta.nameRu}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <SeoTrackedCta
          href="/dizayn-cheloveka/rasschitat"
          trackGoal="hd_calc_start"
          trackParams={{ from: `type_${seo.slug}` }}
        >
          Узнать свой тип бесплатно
        </SeoTrackedCta>
      </div>

      <SeoSection title="Стратегия в жизни">
        <p>{seo.strategyInLife}</p>
      </SeoSection>

      <SeoSection title="Подпись и ложное «я»">
        <p>{seo.signatureAndNotSelf}</p>
      </SeoSection>

      <SeoSection title="Работа и карьера">
        <p>{seo.workAndCareer}</p>
      </SeoSection>

      <SeoSection title="Отношения">
        <p>{seo.relationships}</p>
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
          trackParams={{ from: `type_${seo.slug}_bottom` }}
        >
          Рассчитать свою карту
        </SeoTrackedCta>
      </div>
    </SeoPageShell>
  );
}
