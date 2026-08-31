import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuraSeoPage } from "@/components/aura/AuraSeoPage";
import { AURA_LAYER_SEO, auraLayerBySlug } from "@/lib/seo/aura-content";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return AURA_LAYER_SEO.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = auraLayerBySlug(slug);
  if (!page) return { title: "Слой ауры" };
  return buildSeoMetadata({
    title: page.title,
    description: page.metaDescription,
    path: `/aura/sloi/${page.slug}`,
  });
}

export default async function AuraLayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = auraLayerBySlug(slug);
  if (!page) notFound();

  return (
    <AuraSeoPage
      page={page}
      path={`/aura/sloi/${page.slug}`}
      goal="aura_layer_view"
      kicker="Аура · Слой поля"
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Аура по фото", path: "/aura" },
        { name: "Слои", path: "/aura/sloi" },
        { name: page.h1, path: `/aura/sloi/${page.slug}` },
      ]}
    />
  );
}
