"use client";

import { useEffect, useState } from "react";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { useAuth } from "@/lib/useAuth";
import { FIRST_PHOTO_DISCOUNT_RATIO } from "@/lib/photo-reading-constants";

type CurrentPrice = { baseCost: number; effectiveCost: number; firstPhotoDiscount: boolean };

/** Same live tariff as the photo flow; no price/entitlement inferred from client fallbacks. */
export default function PhotoReadingOffer() {
  const { config, fromServer } = useRuneConfig();
  const { user, isLoggedIn, loading } = useAuth();
  const accountId = isLoggedIn ? user?.sub : undefined;
  const [priceState, setPriceState] = useState<{ accountId: string; price: CurrentPrice | "unavailable" } | null>(null);
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    void fetch("/api/photo-reading/pricing", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("price_unavailable");
        return response.json() as Promise<CurrentPrice>;
      })
      .then((price) => setPriceState({ accountId, price }))
      .catch((error) => { if (error?.name !== "AbortError") setPriceState({ accountId, price: "unavailable" }); });
    return () => controller.abort();
  }, [accountId]);
  const currentPrice = priceState && priceState.accountId === accountId ? priceState.price : null;
  if (!fromServer || loading) return <div className="min-h-[144px] text-sm text-white/60 sm:min-h-[104px]">Точная стоимость появится перед началом разбора.</div>;
  if (!config.enabled) return <p className="text-sm text-aura-champagne">Разбор доступен без списания рун.</p>;
  const cost = config.costs.VISION_ANALYSIS;
  const firstCost = Math.max(1, Math.round(cost * FIRST_PHOTO_DISCOUNT_RATIO));
  const starterCovers = !isLoggedIn && config.starterRunes >= firstCost && config.starterRunes > 0;
  if (isLoggedIn && !currentPrice) return <div className="min-h-[144px] text-sm text-white/60 sm:min-h-[104px]">Проверяем стоимость вашего разбора…</div>;
  if (isLoggedIn && currentPrice === "unavailable") return <p className="text-sm text-white/65">Распознавание бесплатно. Точную цену полной трактовки покажем перед списанием.</p>;
  const actualPrice = isLoggedIn && currentPrice !== "unavailable" ? currentPrice : null;
  return (
    <div className="space-y-2 text-sm" data-testid="photo-reading-offer">
      {starterCovers && <p className="font-medium text-aura-champagne">Стартовых рун хватит на первый разбор без пополнения.</p>}
      {actualPrice ? <p className="text-white/65">
        Ваш полный разбор — {actualPrice.effectiveCost} ᚢ ({Math.round(actualPrice.effectiveCost * config.rubPerRune)} ₽)
        {actualPrice.firstPhotoDiscount ? " со скидкой 50%." : "."}
      </p> : <p className="text-white/65">
        Первый полный разбор — {firstCost} ᚢ ({Math.round(firstCost * config.rubPerRune)} ₽) со скидкой 50%.
        {" "}Следующие — {cost} ᚢ ({Math.round(cost * config.rubPerRune)} ₽).
      </p>}
      <p className="text-xs text-white/50">{actualPrice
        ? "Распознавание и проверка карт бесплатны. Списание только после подтверждения."
        : "Распознавание и проверка карт бесплатны. Точную цену вашей трактовки покажем перед списанием."} ᚢ — руны Zovus.</p>
    </div>
  );
}
