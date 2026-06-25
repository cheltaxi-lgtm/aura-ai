import { buildMasterMetadata } from "@/lib/master-seo";
import HomePage from "@/components/HomePage";
import MasterStructuredData from "@/components/MasterStructuredData";

interface MasterPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: MasterPageProps) {
  const { slug } = await params;
  return buildMasterMetadata(slug);
}

export default async function MasterPage({ params }: MasterPageProps) {
  const { slug } = await params;
  return (
    <>
      <MasterStructuredData slug={slug} />
      <HomePage referrerSlug={slug} />
    </>
  );
}
