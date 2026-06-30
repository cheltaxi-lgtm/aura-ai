import type { Metadata } from "next";
import { BRAND_NAME, getAppUrl } from "@/lib/brand";

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
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: BRAND_NAME,
    },
  };
}
