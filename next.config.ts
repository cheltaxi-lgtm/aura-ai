import type { NextConfig } from "next";
import { getCanonicalRedirects } from "./src/lib/seo/canonical-aliases";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
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
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(self), geolocation=(), payment=(self)",
      },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data: https://fonts.gstatic.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          // 'unsafe-inline' required for Next.js hydration + consent-gated Metrika/captcha bootstraps.
          // script-src-attr blocks inline on* handlers (XSS hardening without breaking Next).
          "script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://yastatic.net https://www.google.com https://www.gstatic.com https://smartcaptcha.yandexcloud.net",
          "script-src-attr 'none'",
          "connect-src 'self' https://mc.yandex.ru https://mc.yandex.com wss://mc.yandex.ru https://yandex.ru https://www.google.com https://www.gstatic.com https://smartcaptcha.yandexcloud.net https://api.yookassa.ru https://yoomoney.ru https://openrouter.ai https://api.openai.com https://api.deepseek.com",
          "frame-src 'self' https://www.google.com https://smartcaptcha.yandexcloud.net https://yoomoney.ru https://yookassa.ru",
          "media-src 'self' blob:",
          "worker-src 'self' blob:",
          "upgrade-insecure-requests",
        ].join("; "),
      },
    ];
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
          ...securityHeaders,
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
          ...securityHeaders,
        ],
      },
      {
        source: "/api/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
