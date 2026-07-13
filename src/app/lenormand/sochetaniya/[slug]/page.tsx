import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import {
  getAllLenormandCombinationSlugs,
  getLenormandCombinationBySlug,
} from "@/lib/seo/lenormand-combinations";
import { getSpreadIntentBySlug } from "@/lib/spread-intents";
import { buildSpreadStartUrl } from "@/lib/spread-intents/router";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

export function generateStaticParams() {
  return getAllLenormandCombinationSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const combo = getLenormandCombinationBySlug(slug);
  if (!combo) return { title: "Сочетание Ленорман" };
  return buildSeoMetadata({
    title: `${combo.title} — сочетание Ленорман | Zovus`,
    description: combo.general,
    path: `/lenormand/sochetaniya/${slug}`,
  });
}

export default async function LenormandCombinationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const combo = getLenormandCombinationBySlug(slug);
  if (!combo) notFound();

  const primaryIntent = combo.relatedIntentSlugs[0]
    ? getSpreadIntentBySlug(combo.relatedIntentSlugs[0])
    : undefined;

  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Ленорман", path: "/lenormand" },
    { name: "Сочетания", path: "/lenormand/sochetaniya" },
    { name: combo.title, path: `/lenormand/sochetaniya/${slug}` },
  ];

  return (
    <SeoPageShell backHref="/lenormand/sochetaniya" backLabel="Все сочетания">
      <SeoPageTracker goal="lenormand_combo_view" params={{ slug }} />
      <SeoBreadcrumbs items={breadcrumbs} />
      <h1 className="font-display text-3xl font-bold">{combo.title}</h1>
      <p className="mt-2 text-sm text-aura-gold/80">{combo.cards.join(" + ")}</p>
      <p className="mt-4 text-white/70">{combo.general}</p>

      <SeoSection title="В любви">{combo.love}</SeoSection>
      <SeoSection title="В работе и делах">{combo.work}</SeoSection>
      <SeoSection title="Совет">{combo.advice}</SeoSection>

      <SeoSection title="Похожие расклады">
        <ul className="space-y-2">
          {combo.relatedIntentSlugs.map((intentSlug) => {
            const intent = getSpreadIntentBySlug(intentSlug);
            if (!intent) return null;
            return (
              <li key={intentSlug}>
                <Link href={`/rasklady/${intentSlug}`} className="text-aura-gold hover:underline">
                  {intent.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </SeoSection>

      {primaryIntent ? (
        <div className="mt-8">
          <SeoTrackedCta
            href={buildSpreadStartUrl(primaryIntent)}
            trackGoal="lenormand_combo_cta"
            trackParams={{ combo: slug }}
          >
            Сделать расклад Ленорман
          </SeoTrackedCta>
        </div>
      ) : null}
    </SeoPageShell>
  );
}
