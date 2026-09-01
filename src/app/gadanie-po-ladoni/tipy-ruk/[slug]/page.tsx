import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PalmSeoPage } from "@/components/palm/PalmSeoPage";
import { PALM_SEO_CRUMBS, PALM_SHAPE_SEO, palmShapeBySlug } from "@/lib/seo/palm-content";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return PALM_SHAPE_SEO.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = palmShapeBySlug(slug);
  if (!page) return { title: "Тип руки" };
  return buildSeoMetadata({
    title: page.title,
    description: page.metaDescription,
    path: `/gadanie-po-ladoni/tipy-ruk/${page.slug}`,
  });
}

export default async function PalmShapePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = palmShapeBySlug(slug);
  if (!page) notFound();
  return (
    <PalmSeoPage
      page={page}
      path={`/gadanie-po-ladoni/tipy-ruk/${page.slug}`}
      goal="palm_shape_view"
      kicker="Хиромантия · Тип руки"
      breadcrumbs={[
        ...PALM_SEO_CRUMBS,
        { name: "Типы рук", path: "/gadanie-po-ladoni/tipy-ruk" },
        { name: page.h1, path: `/gadanie-po-ladoni/tipy-ruk/${page.slug}` },
      ]}
    />
  );
}
