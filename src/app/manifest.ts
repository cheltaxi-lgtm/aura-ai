import type { MetadataRoute } from "next";
import { BRAND_NAME } from "@/lib/brand";
import { SEO_DEFAULT_DESCRIPTION } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: SEO_DEFAULT_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#0b0714",
    theme_color: "#0b0714",
    lang: "ru-RU",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/apple-icon.svg",
        sizes: "180x180",
        type: "image/svg+xml",
      },
    ],
  };
}
