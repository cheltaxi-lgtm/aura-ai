"use client";

import Link from "next/link";
import {
  resolveCrossProductRecommendations,
  type CrossProductContext,
} from "@/lib/cross-product-recommendations";
import { trackCrossProductClick } from "@/lib/seo/product-funnel";

type CrossProductNextStepsProps = {
  context: CrossProductContext;
  /** Same-page handlers (e.g. pair full CTA). */
  onAction?: (action: "pair_full") => void;
  className?: string;
};

/** Short analytics source — avoid substrings blocked by funnel sanitize (e.g. "name"). */
const ANALYTICS_SOURCE: Record<CrossProductContext, string> = {
  matrix: "matrix",
  natal: "natal",
  human_design: "hd",
  matrix_compatibility: "matrix_pair",
};

/**
 * Compact post-free-result next steps — max 2 public CTAs, no auth gate on free links.
 */
export default function CrossProductNextSteps({
  context,
  onAction,
  className,
}: CrossProductNextStepsProps) {
  const items = resolveCrossProductRecommendations(context);
  if (!items.length) return null;

  return (
    <aside
      className={`cross-product-next${className ? ` ${className}` : ""}`}
      aria-labelledby={`cross-product-next-${context}`}
    >
      <h3 id={`cross-product-next-${context}`} className="cross-product-next__kicker">
        Что посмотреть дальше
      </h3>
      <ul className="cross-product-next__list">
        {items.map((item) => {
          const track = () =>
            trackCrossProductClick({
              product: item.product,
              source: ANALYTICS_SOURCE[context],
              state: item.id,
            });

          if (item.action) {
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="cross-product-next__cta"
                  onClick={() => {
                    track();
                    onAction?.(item.action!);
                  }}
                >
                  {item.title}
                </button>
              </li>
            );
          }

          return (
            <li key={item.id}>
              <Link
                href={item.href!}
                className="cross-product-next__cta"
                onClick={track}
              >
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
