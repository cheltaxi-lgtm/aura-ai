import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/brand";
import { CHARACTERS } from "@/lib/characters";
import { SPREAD_REGISTRY } from "@/lib/spreads/registry";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppUrl();
  const now = new Date();

  const masterPages: MetadataRoute.Sitemap = CHARACTERS.map((character) => ({
    url: `${base}/master/${character.id}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const spreadPages: MetadataRoute.Sitemap = Object.values(SPREAD_REGISTRY)
    .filter((s) => s.seoSlug)
    .map((s) => ({
      url: `${base}/rasklad/${s.seoSlug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  return [
    {
      url: base,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${base}/offer`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${base}/disclaimer`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    ...masterPages,
    ...spreadPages,
  ];
}
