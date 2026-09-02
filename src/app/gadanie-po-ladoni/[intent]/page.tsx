import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PalmSeoPage } from "@/components/palm/PalmSeoPage";
import { PALM_INTENT_SEO, PALM_SEO_CRUMBS, palmIntentBySlug } from "@/lib/seo/palm-content";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return PALM_INTENT_SEO.map((item) => ({ intent: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ intent: string }>;
}): Promise<Metadata> {
  const { intent } = await params;
  const page = palmIntentBySlug(intent);
  if (!page) return { title: "Гадание по ладони" };
  return buildSeoMetadata({
    title: page.title,
    description: page.metaDescription,
    path: `/gadanie-po-ladoni/${page.slug}`,
  });
}

export default async function PalmIntentPage({
  params,
}: {
  params: Promise<{ intent: string }>;
}) {
  const { intent } = await params;
  const page = palmIntentBySlug(intent);
  if (!page) notFound();

  return (
    <PalmSeoPage
      page={page}
      path={`/gadanie-po-ladoni/${page.slug}`}
      goal="palm_intent_view"
      kicker="Хиромантия · Тема"
      breadcrumbs={[
        ...PALM_SEO_CRUMBS,
        { name: page.h1, path: `/gadanie-po-ladoni/${page.slug}` },
      ]}
    />
  );
}
