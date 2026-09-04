"use client";

import { useRuneConfig } from "@/lib/useRuneConfig";
import { useAuth } from "@/lib/useAuth";

/** Same live tariff as the photo flow; no price/entitlement inferred from client fallbacks. */
export default function PhotoReadingOffer() {
  const { config, fromServer } = useRuneConfig();
  const { isLoggedIn, loading } = useAuth();
  if (!fromServer || loading) return <div className="min-h-[144px] text-sm text-white/60 sm:min-h-[104px]">Точная стоимость появится перед началом разбора.</div>;
  if (!config.enabled) return <p className="text-sm text-aura-champagne">Разбор доступен без списания рун.</p>;
  const cost = config.costs.VISION_ANALYSIS;
  const starterCovers = !isLoggedIn && config.starterRunes >= cost && config.starterRunes > 0;
  return (
    <div className="min-h-[144px] space-y-2 text-sm sm:min-h-[104px]" data-testid="photo-reading-offer">
      {starterCovers && <p className="font-medium text-aura-champagne">Первый разбор — на стартовые руны, без пополнения.</p>}
      <p className="text-white/65">
        Обычная стоимость полного разбора — {cost} ᚢ ({Math.round(cost * config.rubPerRune)} ₽).
        {" "}Для первого ФотоТаро действует скидка 50%. Точная сумма — перед началом.
      </p>
      <p className="text-xs text-white/50">ᚢ — руны на вашем балансе. Распознавание карт и их проверка входят в разбор.</p>
    </div>
  );
}
