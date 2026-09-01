import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PalmSeoPage } from "@/components/palm/PalmSeoPage";
import { PALM_MOUNT_SEO, PALM_SEO_CRUMBS, palmMountBySlug } from "@/lib/seo/palm-content";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return PALM_MOUNT_SEO.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = palmMountBySlug(slug);
  if (!page) return { title: "Холм ладони" };
  return buildSeoMetadata({
    title: page.title,
    description: page.metaDescription,
    path: `/gadanie-po-ladoni/kholmy/${page.slug}`,
  });
}

export default async function PalmMountPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = palmMountBySlug(slug);
  if (!page) notFound();
  return (
    <PalmSeoPage
      page={page}
      path={`/gadanie-po-ladoni/kholmy/${page.slug}`}
      goal="palm_mount_view"
      kicker="Хиромантия · Холм"
      breadcrumbs={[
        ...PALM_SEO_CRUMBS,
        { name: "Холмы", path: "/gadanie-po-ladoni/kholmy" },
        { name: page.h1, path: `/gadanie-po-ladoni/kholmy/${page.slug}` },
      ]}
    />
  );
}
