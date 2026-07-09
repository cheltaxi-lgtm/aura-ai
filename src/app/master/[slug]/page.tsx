import { buildMasterMetadata } from "@/lib/master-seo";
import HomePage from "@/components/HomePage";
import MasterStructuredData from "@/components/MasterStructuredData";
import { isRitualType } from "@/lib/ritual-config";

interface MasterPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ritual?: string }>;
}

export async function generateMetadata({ params }: MasterPageProps) {
  const { slug } = await params;
  return buildMasterMetadata(slug);
}

export default async function MasterPage({ params, searchParams }: MasterPageProps) {
  const { slug } = await params;
  const { ritual } = await searchParams;
  const autoOpenRitualType = ritual && isRitualType(ritual) ? ritual : undefined;
  return (
    <>
      <MasterStructuredData slug={slug} />
      <HomePage
        referrerSlug={slug}
        autoOpenMasterId={slug}
        autoOpenRitualType={autoOpenRitualType}
      />
    </>
  );
}
