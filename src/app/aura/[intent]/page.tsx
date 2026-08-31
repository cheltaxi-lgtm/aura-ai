import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuraSeoPage } from "@/components/aura/AuraSeoPage";
import { AURA_INTENT_SEO, AURA_SEO_CRUMBS, auraIntentBySlug } from "@/lib/seo/aura-content";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return AURA_INTENT_SEO.map((item) => ({ intent: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ intent: string }>;
}): Promise<Metadata> {
  const { intent } = await params;
  const page = auraIntentBySlug(intent);
  if (!page) return { title: "Аура" };
  return buildSeoMetadata({
    title: page.title,
    description: page.metaDescription,
    path: `/aura/${page.slug}`,
  });
}

export default async function AuraIntentPage({
  params,
}: {
  params: Promise<{ intent: string }>;
}) {
  const { intent } = await params;
  const page = auraIntentBySlug(intent);
  if (!page) notFound();

  return (
    <AuraSeoPage
      page={page}
      path={`/aura/${page.slug}`}
      goal="aura_intent_view"
      kicker="Аура · Разбор темы"
      breadcrumbs={[
        ...AURA_SEO_CRUMBS,
        { name: page.h1, path: `/aura/${page.slug}` },
      ]}
    />
  );
}
