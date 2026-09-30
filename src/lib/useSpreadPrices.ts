"use client";

import { useEffect, useState } from "react";

export function useSpreadPrices(): Record<string, number> | null {
  const [prices, setPrices] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/rasklady/prices", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Spread prices unavailable");
        return response.json() as Promise<{ prices?: Record<string, number> }>;
      })
      .then((data) => {
        if (!controller.signal.aborted && data.prices) setPrices(data.prices);
      })
      .catch(() => { /* Keep the price undisclosed if the live source is unavailable. */ });
    return () => controller.abort();
  }, []);

  return prices;
}
