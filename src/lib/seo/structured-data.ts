import type { BreadcrumbItem } from "@/lib/seo/breadcrumbs";
import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumbs";
import { getAppUrl, BRAND_NAME } from "@/lib/brand";
import type { CardFaqItem } from "@/lib/seo/card-faq";

export function buildCardStructuredData({
  name,
  slug,
  description,
  keyword,
  breadcrumbs,
  faq,
}: {
  name: string;
  slug: string;
  description: string;
  keyword: string;
  breadcrumbs: BreadcrumbItem[];
  faq: CardFaqItem[];
}) {
  const url = `${getAppUrl()}/cards/${slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildBreadcrumbJsonLd(breadcrumbs),
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
  breadcrumbs,
}: {
  title: string;
  description: string;
  path: string;
  faq: { question: string; answer: string }[];
  breadcrumbs: BreadcrumbItem[];
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildBreadcrumbJsonLd(breadcrumbs),
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
  breadcrumbs,
}: {
  title: string;
  description: string;
  path: string;
  breadcrumbs: BreadcrumbItem[];
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildBreadcrumbJsonLd(breadcrumbs),
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
  breadcrumbs,
  faq,
}: {
  title: string;
  description: string;
  path: string;
  breadcrumbs: BreadcrumbItem[];
  faq: { q: string; a: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildBreadcrumbJsonLd(breadcrumbs),
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
