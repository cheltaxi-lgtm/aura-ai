import type { MetadataRoute } from "next";
import { getAllTarotCardSeoSlugs } from "@/lib/card-seo";
import { getAllCardCombinations } from "@/lib/card-combinations/registry";
import { getAppUrl } from "@/lib/brand";
import { CHARACTERS } from "@/lib/characters";
import { RITUAL_PAGE_SLUGS } from "@/lib/ritual-recommendations";
import { getAllSpreadIntents } from "@/lib/spread-intents";
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

  const intentPages: MetadataRoute.Sitemap = getAllSpreadIntents().map((intent) => ({
    url: `${base}/rasklady/${intent.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.75,
  }));

  const ritualPages: MetadataRoute.Sitemap = Object.values(RITUAL_PAGE_SLUGS).map((slug) => ({
    url: `${base}/obryady/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.55,
  }));

  const cardPages: MetadataRoute.Sitemap = getAllTarotCardSeoSlugs().map((slug) => ({
    url: `${base}/cards/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  const combinationPages: MetadataRoute.Sitemap = getAllCardCombinations().map((combo) => ({
    url: `${base}/cards/combinations/${combo.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.45,
  }));

  const landingPages: MetadataRoute.Sitemap = [
    { path: "/rasklady", priority: 0.85 },
    { path: "/photo-rasklad", priority: 0.7 },
    { path: "/app", priority: 0.75 },
    { path: "/obryady", priority: 0.65 },
    { path: "/joint-reading", priority: 0.6 },
    { path: "/numerology", priority: 0.6 },
    { path: "/numerology/pythagoras-square", priority: 0.55 },
    { path: "/numerology/compatibility", priority: 0.55 },
    { path: "/numerology/favorable-dates", priority: 0.55 },
    { path: "/cards", priority: 0.55 },
    { path: "/cards/combinations", priority: 0.5 },
  ].map(({ path, priority }) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority,
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
    ...landingPages,
    ...intentPages,
    ...ritualPages,
    ...cardPages,
    ...combinationPages,
  ];
}
