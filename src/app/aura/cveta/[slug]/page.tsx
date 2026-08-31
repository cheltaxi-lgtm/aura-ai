import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuraSeoPage } from "@/components/aura/AuraSeoPage";
import { AURA_COLOR_SEO, AURA_SEO_CRUMBS, auraColorBySlug } from "@/lib/seo/aura-content";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return AURA_COLOR_SEO.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = auraColorBySlug(slug);
  if (!page) return { title: "Цвет ауры" };
  return buildSeoMetadata({
    title: page.title,
    description: page.metaDescription,
    path: `/aura/cveta/${page.slug}`,
  });
}

export default async function AuraColorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = auraColorBySlug(slug);
  if (!page) notFound();

  return (
    <AuraSeoPage
      page={page}
      path={`/aura/cveta/${page.slug}`}
      goal="aura_color_view"
      kicker="Аура · Цвет поля"
      swatch={page.hex}
      breadcrumbs={[
        ...AURA_SEO_CRUMBS,
        { name: "Цвета", path: "/aura/cveta" },
        { name: page.h1, path: `/aura/cveta/${page.slug}` },
      ]}
    />
  );
}
