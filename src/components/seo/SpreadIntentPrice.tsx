"use client";

import { useSpreadPrices } from "@/lib/useSpreadPrices";

export default function SpreadIntentPrice({ spreadId }: { spreadId: string }) {
  const prices = useSpreadPrices();
  const amount = prices?.[spreadId];
  return <strong>{amount === undefined ? "Уточним перед началом" : `от ${amount} ᚢ`}</strong>;
}
