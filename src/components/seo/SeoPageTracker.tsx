"use client";

import { useEffect } from "react";
import { trackSeoEvent } from "@/lib/seo/metrika";
import {
  trackProductFunnel,
  type ProductFunnelProduct,
} from "@/lib/seo/product-funnel";

export default function SeoPageTracker({
  goal,
  params,
  funnelProduct,
  funnelSource,
}: {
  goal: string;
  params?: Record<string, string>;
  /** When set, also emits unified product_view (product/source/state only). */
  funnelProduct?: ProductFunnelProduct;
  funnelSource?: string;
}) {
  useEffect(() => {
    trackSeoEvent(goal, params);
    if (funnelProduct) {
      trackProductFunnel("product_view", {
        product: funnelProduct,
        source: funnelSource || goal,
      });
    }
  }, [goal, params, funnelProduct, funnelSource]);

  return null;
}
