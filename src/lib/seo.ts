import type { Metadata } from "next";
import { BRAND_NAME, BRAND_URL } from "@/lib/brand";
import { LANDING_FAQ_ITEMS } from "@/lib/landing-offer";

export const SEO_DEFAULT_TITLE =
  "Zovus — ИИ-наставники и персональные эзотерические консультации";

export const SEO_DEFAULT_DESCRIPTION =
  "Zovus — сервис персональных эзотерических консультаций с ИИ-наставниками в художественных образах. Таро, руны, астрология и нумерология онлайн.";

export const SEO_KEYWORDS = [
  "Zovus",
  "Зовус",
  "эзотерика",
  "эзотерические консультации",
  "духовный наставник",
  "таро",
  "астрология",
  "нумерология",
  "руны",
  "онлайн консультация",
  "персональный наставник",
  "духовные практики",
  "гадание онлайн",
  "расклад таро",
] as const;

export const SEO_FAQ_ITEMS = LANDING_FAQ_ITEMS;

export function getRootMetadata(): Metadata {
  return {
    metadataBase: new URL(BRAND_URL),
    applicationName: BRAND_NAME,
    title: {
      default: SEO_DEFAULT_TITLE,
      template: `%s | ${BRAND_NAME}`,
    },
    description: SEO_DEFAULT_DESCRIPTION,
    keywords: [...SEO_KEYWORDS],
    authors: [{ name: BRAND_NAME, url: BRAND_URL }],
    creator: BRAND_NAME,
    publisher: BRAND_NAME,
    category: "spiritual services",
    openGraph: {
      type: "website",
      locale: "ru_RU",
      url: BRAND_URL,
      siteName: BRAND_NAME,
      title: SEO_DEFAULT_TITLE,
      description:
        "Выберите своего проводника и получите персональную эзотерическую консультацию онлайн.",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "Zovus — персональные эзотерические консультации",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: SEO_DEFAULT_TITLE,
      description:
        "Выберите своего проводника и получите персональную консультацию онлайн.",
      images: ["/opengraph-image"],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    verification: {
      yandex: "7902ba7dfdb76ac3",
      google: "2xfoyJJx5rzmo7m9RUmw07wh1Zh3YBveFi71f3aZAqw",
    },
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
    },
  };
}

export function getHomeStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${BRAND_URL}/#website`,
        url: BRAND_URL,
        name: BRAND_NAME,
        inLanguage: "ru-RU",
        publisher: { "@id": `${BRAND_URL}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${BRAND_URL}/#organization`,
        name: BRAND_NAME,
        url: BRAND_URL,
        logo: {
          "@type": "ImageObject",
          url: `${BRAND_URL}/logo.png`,
          width: 512,
          height: 512,
        },
      },
      {
        "@type": "Service",
        "@id": `${BRAND_URL}/#service`,
        name: "Персональные эзотерические консультации",
        serviceType: "Онлайн-консультации",
        provider: { "@id": `${BRAND_URL}/#organization` },
        areaServed: {
          "@type": "Country",
          name: "Россия",
        },
        url: BRAND_URL,
        description:
          "Онлайн-сервис персональных эзотерических консультаций и духовных практик с выбором наставника.",
      },
      {
        "@type": "FAQPage",
        "@id": `${BRAND_URL}/#faq`,
        url: BRAND_URL,
        inLanguage: "ru-RU",
        mainEntity: SEO_FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };
}
