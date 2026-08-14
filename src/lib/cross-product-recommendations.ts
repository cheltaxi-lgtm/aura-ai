/**
 * Compact “Что посмотреть дальше” after free public results.
 * Public routes only; max 2; never recommend the current product.
 */

import type { ProductFunnelProduct } from "@/lib/seo/product-funnel";

export type CrossProductContext =
  | "matrix"
  | "natal"
  | "human_design"
  | "matrix_compatibility";

export type CrossProductRec = {
  id: string;
  /** Destination product for analytics (never PII). */
  product: ProductFunnelProduct;
  title: string;
  href: string;
};

const PUBLIC = {
  matrix: "/numerology/destiny-matrix",
  natal: "/natalnaya-karta",
  human_design: "/dizayn-cheloveka/rasschitat",
  matrix_compatibility: "/numerology/matrica-sovmestimosti",
} as const;

const CATALOG: Record<CrossProductContext, readonly CrossProductRec[]> = {
  matrix: [
    {
      id: "natal",
      product: "natal",
      title: "Натальная карта",
      href: PUBLIC.natal,
    },
    {
      id: "matrix_pair",
      product: "matrix_compatibility",
      title: "Совместимость матриц",
      href: PUBLIC.matrix_compatibility,
    },
  ],
  natal: [
    {
      id: "hd",
      product: "human_design",
      title: "Дизайн человека",
      href: PUBLIC.human_design,
    },
    {
      id: "matrix",
      product: "matrix",
      title: "Матрица судьбы",
      href: PUBLIC.matrix,
    },
  ],
  human_design: [
    {
      id: "natal",
      product: "natal",
      title: "Натальная карта",
      href: PUBLIC.natal,
    },
    {
      id: "matrix",
      product: "matrix",
      title: "Матрица судьбы",
      href: PUBLIC.matrix,
    },
  ],
  matrix_compatibility: [
    {
      id: "matrix",
      product: "matrix",
      title: "Матрица судьбы",
      href: PUBLIC.matrix,
    },
    {
      id: "natal",
      product: "natal",
      title: "Натальная карта",
      href: PUBLIC.natal,
    },
  ],
};

/** Context → product id used for self-filter. */
const CONTEXT_PRODUCT: Record<CrossProductContext, ProductFunnelProduct> = {
  matrix: "matrix",
  natal: "natal",
  human_design: "human_design",
  matrix_compatibility: "matrix_compatibility",
};

/**
 * Resolve 1–2 next-step CTAs. Excludes self-product link recs.
 * Paid upgrade for the current product is the primary CTA, not this list.
 */
export function resolveCrossProductRecommendations(
  context: CrossProductContext,
  options?: { max?: number }
): CrossProductRec[] {
  const max = Math.min(2, Math.max(1, options?.max ?? 2));
  const self = CONTEXT_PRODUCT[context];
  const list = CATALOG[context] ?? [];
  const filtered = list.filter((rec) => rec.product !== self && Boolean(rec.href));
  return filtered.slice(0, max);
}

export const CROSS_PRODUCT_PUBLIC_ROUTES = PUBLIC;
