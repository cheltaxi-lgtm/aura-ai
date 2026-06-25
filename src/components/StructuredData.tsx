import { getHomeStructuredData } from "@/lib/seo";

export default function StructuredData() {
  const structuredData = getHomeStructuredData();

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
