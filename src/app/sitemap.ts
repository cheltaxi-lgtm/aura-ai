import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/brand";
import { CHARACTERS } from "@/lib/characters";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppUrl();
  const now = new Date();

  const masterPages: MetadataRoute.Sitemap = CHARACTERS.map((character) => ({
    url: `${base}/master/${character.id}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [
    {
      url: base,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...masterPages,
  ];
}
