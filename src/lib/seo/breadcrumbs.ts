import { getAppUrl } from "@/lib/brand";

export type BreadcrumbItem = { name: string; path: string };

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  const base = getAppUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${base}${item.path}`,
    })),
  };
}
