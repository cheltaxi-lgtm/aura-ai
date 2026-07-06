import { getAppUrl, BRAND_NAME } from "@/lib/brand";
import type { CardFaqItem } from "@/lib/seo/card-faq";

/**
 * Note: BreadcrumbList is intentionally omitted here — <SeoBreadcrumbs> already
 * renders its own BreadcrumbList JSON-LD alongside the visible breadcrumb nav.
 * Adding it here too would duplicate the schema on the same page.
 */

export function buildCardStructuredData({
  name,
  slug,
  description,
  keyword,
  faq,
}: {
  name: string;
  slug: string;
  description: string;
  keyword: string;
  faq: CardFaqItem[];
}) {
  const url = `${getAppUrl()}/cards/${slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: `${name} — значение карты Таро`,
        description,
        keywords: keyword,
        url,
        author: { "@type": "Organization", name: BRAND_NAME },
        publisher: { "@type": "Organization", name: BRAND_NAME },
        mainEntityOfPage: url,
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
}

export function buildSpreadStructuredData({
  title,
  description,
  path,
  faq,
}: {
  title: string;
  description: string;
  path: string;
  faq: { question: string; answer: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: title,
        description,
        url: `${getAppUrl()}${path}`,
        author: { "@type": "Organization", name: BRAND_NAME },
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
}

export function buildArticleStructuredData({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: title,
        description,
        url: `${getAppUrl()}${path}`,
        author: { "@type": "Organization", name: BRAND_NAME },
        publisher: { "@type": "Organization", name: BRAND_NAME },
      },
    ],
  };
}

export function buildForecastStructuredData({
  title,
  description,
  path,
  faq,
}: {
  title: string;
  description: string;
  path: string;
  faq: { q: string; a: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: title,
        description,
        url: `${getAppUrl()}${path}`,
        author: { "@type": "Organization", name: BRAND_NAME },
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
}
