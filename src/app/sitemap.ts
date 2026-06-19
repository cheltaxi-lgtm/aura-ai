import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://aura.example.com";
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/cabinet`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/runes`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
  ];
}
