import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuraSeoPage } from "@/components/aura/AuraSeoPage";
import { AURA_CHAKRA_SEO, auraChakraBySlug } from "@/lib/seo/aura-content";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return AURA_CHAKRA_SEO.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = auraChakraBySlug(slug);
  if (!page) return { title: "Чакра" };
  return buildSeoMetadata({
    title: page.title,
    description: page.metaDescription,
    path: `/aura/chakry/${page.slug}`,
  });
}

export default async function AuraChakraPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = auraChakraBySlug(slug);
  if (!page) notFound();

  return (
    <AuraSeoPage
      page={page}
      path={`/aura/chakry/${page.slug}`}
      goal="aura_chakra_view"
      kicker="Аура · Чакра"
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Аура по фото", path: "/aura" },
        { name: "Чакры", path: "/aura/chakry" },
        { name: page.h1, path: `/aura/chakry/${page.slug}` },
      ]}
    />
  );
}
