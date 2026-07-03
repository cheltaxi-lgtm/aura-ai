import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  const base = getAppUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin/",
        "/auth/",
        "/login",
        "/register",
        "/cabinet",
        "/account",
        "/dashboard",
        "/checkout",
        "/payment",
        "/webhook",
        "/diary",
        "/expert",
        "/expert/",
        "/runes/success",
        "/share/",
        "/master/",
        "/_next/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
