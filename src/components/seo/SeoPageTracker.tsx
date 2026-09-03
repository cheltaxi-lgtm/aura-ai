"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { hasCookieConsent, METRIKA_READY_EVENT } from "@/lib/cookie-consent";
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
  const pathname = usePathname();
  const lastView = useRef<string | null>(null);
  useEffect(() => {
    const sendCurrentView = () => {
      if (!hasCookieConsent() || !window.ym) return;
      const key = JSON.stringify([pathname, goal, params, funnelProduct, funnelSource]);
      if (lastView.current === key) return;
      lastView.current = key;
      trackSeoEvent(goal, params);
      if (funnelProduct) {
        trackProductFunnel("product_view", {
          product: funnelProduct,
          source: funnelSource || goal,
        });
      }
    };
    sendCurrentView();
    window.addEventListener(METRIKA_READY_EVENT, sendCurrentView);
    return () => window.removeEventListener(METRIKA_READY_EVENT, sendCurrentView);
  }, [pathname, goal, params, funnelProduct, funnelSource]);

  return null;
}
