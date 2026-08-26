import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import {
  getAppliedSeoOverrides,
  type SeoInternalLink,
} from "@/modules/ads/organic/overrides";

const H1_CLASS = "mt-2 font-display text-3xl font-bold";

export async function AdsSeoH1({
  path,
  className = H1_CLASS,
  children,
}: {
  path: string;
  className?: string;
  children: string;
}) {
  const ov = await getAppliedSeoOverrides(path);
  return <h1 className={className}>{ov.h1?.trim() || children}</h1>;
}

export async function AdsSeoRelatedTools({
  path,
  excludeHrefs = [],
  extraLinks,
}: {
  path: string;
  excludeHrefs?: string[];
  extraLinks?: SeoInternalLink[];
}) {
  const ov = await getAppliedSeoOverrides(path);
  const extra = [...(ov.internal_links ?? []), ...(extraLinks ?? [])];
  return (
    <SeoRelatedTools
      excludeHrefs={excludeHrefs}
      extraLinks={extra.map((l) => ({ href: l.href, label: l.label }))}
    />
  );
}

export async function AdsSeoJsonLd({ path }: { path: string }) {
  const ov = await getAppliedSeoOverrides(path);
  if (!ov.schema_json) return null;
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ov.schema_json }} />
  );
}
