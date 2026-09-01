import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PalmSeoPage } from "@/components/palm/PalmSeoPage";
import { PALM_LINE_SEO, PALM_SEO_CRUMBS, palmLineBySlug } from "@/lib/seo/palm-content";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return PALM_LINE_SEO.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = palmLineBySlug(slug);
  if (!page) return { title: "Линия ладони" };
  return buildSeoMetadata({
    title: page.title,
    description: page.metaDescription,
    path: `/gadanie-po-ladoni/linii/${page.slug}`,
  });
}

export default async function PalmLinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = palmLineBySlug(slug);
  if (!page) notFound();
  return (
    <PalmSeoPage
      page={page}
      path={`/gadanie-po-ladoni/linii/${page.slug}`}
      goal="palm_line_view"
      kicker="Хиромантия · Линия"
      breadcrumbs={[
        ...PALM_SEO_CRUMBS,
        { name: "Линии", path: "/gadanie-po-ladoni/linii" },
        { name: page.h1, path: `/gadanie-po-ladoni/linii/${page.slug}` },
      ]}
    />
  );
}
