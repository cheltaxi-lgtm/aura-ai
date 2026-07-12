import type { NextConfig } from "next";
import { getCanonicalRedirects } from "./src/lib/seo/canonical-aliases";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  experimental: {
    middlewareClientMaxBodySize: "10mb",
    serverActions: {
      bodySizeLimit: "10mb",
    },
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async redirects() {
    return getCanonicalRedirects();
  },
  async headers() {
    return [
      {
        source: "/sw-app-shell.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        // SEO/SSG pages: allow CDN/proxy cache; avoid no-store on every crawl.
        source:
          "/((?!_next/static|_next/image|favicon.ico|decks/|icon.svg|apple-icon.svg|opengraph-image|api/).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
