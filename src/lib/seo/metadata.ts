import type { Metadata } from "next";
import { BRAND_NAME, getAppUrl } from "@/lib/brand";
import { getAppliedSeoOverrides, pinCanonicalToAppOrigin } from "@/modules/ads/organic/overrides";

/**
 * The root layout sets `title.template = "%s | Zovus"`, so any page-level
 * title that already ends in "| Zovus" would render doubled
 * ("... | Zovus | Zovus"). Strip that suffix here so callers can keep writing
 * explicit "| Zovus" titles (for readability / existing content) without
 * producing duplicated branding in the actual <title> tag.
 */
function stripBrandSuffix(title: string): string {
  // Match "| Zovus", "— Zovus", "– Zovus", "- Zovus" (ASCII / en / em dash).
  const suffix = new RegExp(`\\s*[|·\\-–—]\\s*${BRAND_NAME}\\s*$`, "i");
  let clean = title.replace(suffix, "").trim();
  // Collapse accidental double brand left by older absolute titles.
  clean = clean.replace(suffix, "").trim();
  return clean;
}

export function buildSeoMetadata({
  title,
  description,
  path,
  noIndex = false,
}: {
  title: string;
  description: string;
  path?: string;
  /** Keep page usable, but out of search (thin / duplicate templates). */
  noIndex?: boolean;
}): Metadata {
  const url = path ? `${getAppUrl()}${path}` : getAppUrl();
  const cleanTitle = stripBrandSuffix(title);
  const ogImageUrl = `${getAppUrl()}/opengraph-image`;
  return {
    title: cleanTitle,
    description,
    ...(noIndex
      ? { robots: { index: false, follow: true, googleBot: { index: false, follow: true } } }
      : {}),
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: cleanTitle,
      description,
      url,
      type: "website",
      siteName: BRAND_NAME,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: BRAND_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title: cleanTitle,
      description,
      images: [ogImageUrl],
    },
  };
}

/** Merge live ads.seo_override onto static hub metadata. Fail-open (no ads DB → base). */
export async function buildSeoMetadataWithOverrides(
  path: string,
  base: {
    title: string;
    description: string;
    path?: string;
    noIndex?: boolean;
  }
): Promise<Metadata> {
  const ov = await getAppliedSeoOverrides(path);
  const robots = ov.robots?.toLowerCase() ?? "";
  const noIndex = robots.includes("noindex")
    ? true
    : robots.includes("index")
      ? false
      : Boolean(base.noIndex);
  const meta = buildSeoMetadata({
    title: ov.title?.trim() || base.title,
    description: ov.description?.trim() || base.description,
    path: base.path ?? path,
    noIndex,
  });
  if (ov.canonical?.trim()) {
    const url = pinCanonicalToAppOrigin(ov.canonical);
    if (url) {
      meta.alternates = { ...(meta.alternates ?? {}), canonical: url };
      if (meta.openGraph) meta.openGraph = { ...meta.openGraph, url };
    }
  }
  return meta;
}
