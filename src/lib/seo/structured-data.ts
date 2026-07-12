import { getAppUrl, BRAND_NAME } from "@/lib/brand";
import type { CardFaqItem } from "@/lib/seo/card-faq";

/**
 * Note: BreadcrumbList is intentionally omitted here — <SeoBreadcrumbs> already
 * renders its own BreadcrumbList JSON-LD alongside the visible breadcrumb nav.
 * Adding it here too would duplicate the schema on the same page.
 *
 * Every Article node below also carries `@id` and `text` — the three mandatory
 * fields (id, headline, text) required by Yandex Metrika's "Контентная аналитика"
 * (content analytics) JSON-LD markup: https://yandex.ru/support/metrica/ru/publishers/schema-org/json-ld
 */

function joinContentText(parts: (string | null | undefined)[]): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .join(" ");
}

export function buildCardStructuredData({
  name,
  slug,
  description,
  keyword,
  faq,
  extraText,
}: {
  name: string;
  slug: string;
  description: string;
  keyword: string;
  faq: CardFaqItem[];
  /** Additional body copy (love/money/self/etc.) to enrich the content-analytics text field. */
  extraText?: string;
}) {
  const url = `${getAppUrl()}/cards/${slug}`;
  const text = joinContentText([
    description,
    extraText,
    ...faq.map((item) => `${item.question} ${item.answer}`),
  ]);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#content`,
        headline: `${name} — значение карты Таро`,
        description,
        text,
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
  const url = `${getAppUrl()}${path}`;
  const text = joinContentText([
    description,
    ...faq.map((item) => `${item.question} ${item.answer}`),
  ]);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#content`,
        headline: title,
        description,
        text,
        url,
        author: { "@type": "Organization", name: BRAND_NAME },
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

export function buildArticleStructuredData({
  title,
  description,
  path,
  bodyText,
}: {
  title: string;
  description: string;
  path: string;
  /** Full article body (intro + sections) — feeds Metrika's read-depth/scroll metrics. */
  bodyText?: string;
}) {
  const url = `${getAppUrl()}${path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#content`,
        headline: title,
        description,
        text: joinContentText([bodyText, description]),
        url,
        author: { "@type": "Organization", name: BRAND_NAME },
        publisher: { "@type": "Organization", name: BRAND_NAME },
        mainEntityOfPage: url,
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
  const url = `${getAppUrl()}${path}`;
  const text = joinContentText([description, ...faq.map((item) => `${item.q} ${item.a}`)]);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#content`,
        headline: title,
        description,
        text,
        url,
        author: { "@type": "Organization", name: BRAND_NAME },
        mainEntityOfPage: url,
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
