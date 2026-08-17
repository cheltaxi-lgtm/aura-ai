import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { ALL_CHANNEL_SLUGS, centerSeoSlug, channelSeo } from "@/lib/human-design/seo-entities";
import { CENTER_NAMES_RU, GATE_NAMES_RU } from "@/lib/human-design";

export function generateStaticParams() {
  return ALL_CHANNEL_SLUGS.map((channel) => ({ channel }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ channel: string }>;
}): Promise<Metadata> {
  const { channel } = await params;
  const seo = channelSeo(channel);
  if (!seo) return { title: "Дизайн Человека" };
  return buildSeoMetadata({
    title: seo.title,
    description: seo.metaDescription,
    path: `/dizayn-cheloveka/kanaly/${seo.slug}`,
  });
}

export default async function HdChannelPage({
  params,
}: {
  params: Promise<{ channel: string }>;
}) {
  const { channel } = await params;
  const seo = channelSeo(channel);
  if (!seo) notFound();

  const structuredData = buildForecastStructuredData({
    title: seo.title,
    description: seo.metaDescription,
    path: `/dizayn-cheloveka/kanaly/${seo.slug}`,
    faq: seo.faq,
  });

  return (
    <SeoPageShell
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Дизайн Человека", path: "/dizayn-cheloveka" },
        { name: "Каналы", path: "/dizayn-cheloveka/kanaly" },
        { name: `Канал ${seo.key}`, path: `/dizayn-cheloveka/kanaly/${seo.slug}` },
      ]}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal="hd_channel_view" params={{ channel: seo.slug }} />

      <p className="text-sm text-aura-gold/80">Дизайн Человека · Каналы</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{seo.title}</h1>
      <p className="mt-4 text-white/70">{seo.intro}</p>

      <dl className="mt-6 grid grid-cols-2 gap-2.5 text-sm">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
          <dt className="text-[0.625rem] uppercase tracking-wider text-amber-100/50">Ворота</dt>
          <dd className="mt-1 font-semibold text-amber-50">
            <Link href={`/dizayn-cheloveka/vorota/${seo.gates[0]}`} className="hover:text-amber-200">
              {seo.gates[0]} «{GATE_NAMES_RU[seo.gates[0]]}»
            </Link>
            {" · "}
            <Link href={`/dizayn-cheloveka/vorota/${seo.gates[1]}`} className="hover:text-amber-200">
              {seo.gates[1]} «{GATE_NAMES_RU[seo.gates[1]]}»
            </Link>
          </dd>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
          <dt className="text-[0.625rem] uppercase tracking-wider text-amber-100/50">Центры</dt>
          <dd className="mt-1 font-semibold text-amber-50">
            <Link
              href={`/dizayn-cheloveka/centry/${centerSeoSlug(seo.centers[0])}`}
              className="hover:text-amber-200"
            >
              {CENTER_NAMES_RU[seo.centers[0]]}
            </Link>
            {" — "}
            <Link
              href={`/dizayn-cheloveka/centry/${centerSeoSlug(seo.centers[1])}`}
              className="hover:text-amber-200"
            >
              {CENTER_NAMES_RU[seo.centers[1]]}
            </Link>
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        <SeoTrackedCta
          href="/dizayn-cheloveka/rasschitat"
          trackGoal="hd_calc_start"
          trackParams={{ from: `channel_${seo.slug}` }}
        >
          Проверить свои каналы бесплатно
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
          trackParams={{ from: `channel_${seo.slug}_bottom` }}
        >
          Рассчитать свою карту
        </SeoTrackedCta>
      </div>
    </SeoPageShell>
  );
}
