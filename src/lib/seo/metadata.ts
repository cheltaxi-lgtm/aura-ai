import type { Metadata } from "next";
import { BRAND_NAME, getAppUrl } from "@/lib/brand";

/**
 * The root layout sets `title.template = "%s | Zovus"`, so any page-level
 * title that already ends in "| Zovus" would render doubled
 * ("... | Zovus | Zovus"). Strip that suffix here so callers can keep writing
 * explicit "| Zovus" titles (for readability / existing content) without
 * producing duplicated branding in the actual <title> tag.
 */
function stripBrandSuffix(title: string): string {
  const suffix = new RegExp(`\\s*[|·-]\\s*${BRAND_NAME}\\s*$`, "i");
  return title.replace(suffix, "").trim();
}

export function buildSeoMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path?: string;
}): Metadata {
  const url = path ? `${getAppUrl()}${path}` : getAppUrl();
  const cleanTitle = stripBrandSuffix(title);
  const ogImageUrl = `${getAppUrl()}/opengraph-image`;
  return {
    title: cleanTitle,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: BRAND_NAME,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: BRAND_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}
