import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PalmSeoPage } from "@/components/palm/PalmSeoPage";
import { PALM_MARK_SEO, PALM_SEO_CRUMBS, palmMarkBySlug } from "@/lib/seo/palm-content";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return PALM_MARK_SEO.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = palmMarkBySlug(slug);
  if (!page) return { title: "Знак на ладони" };
  return buildSeoMetadata({
    title: page.title,
    description: page.metaDescription,
    path: `/gadanie-po-ladoni/znaki/${page.slug}`,
  });
}

export default async function PalmMarkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = palmMarkBySlug(slug);
  if (!page) notFound();
  return (
    <PalmSeoPage
      page={page}
      path={`/gadanie-po-ladoni/znaki/${page.slug}`}
      goal="palm_mark_view"
      kicker="Хиромантия · Знак"
      breadcrumbs={[
        ...PALM_SEO_CRUMBS,
        { name: "Знаки", path: "/gadanie-po-ladoni/znaki" },
        { name: page.h1, path: `/gadanie-po-ladoni/znaki/${page.slug}` },
      ]}
    />
  );
}
