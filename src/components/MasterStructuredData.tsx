import { getMasterStructuredData } from "@/lib/master-seo";

interface MasterStructuredDataProps {
  slug: string;
}

export default function MasterStructuredData({ slug }: MasterStructuredDataProps) {
  const structuredData = getMasterStructuredData(slug);
  if (!structuredData) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
