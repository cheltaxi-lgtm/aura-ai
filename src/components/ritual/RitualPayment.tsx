"use client";

import { usePaywall } from "@/contexts/PaywallContext";
import RuneCost from "@/components/RuneCost";
import { RITUAL_TYPES, type RitualType } from "@/lib/ritual-config";
import { canAffordRunes } from "@/lib/rune-afford-client";

interface Props {
  ritualType: RitualType;
  characterKey: string;
  cost: number;
  balance: number;
  isUnlimited?: boolean;
  cards: Array<{ name: string; position: string }>;
  onPay: () => void;
  paying?: boolean;
}

export default function RitualPayment({
  ritualType,
  characterKey,
  cost,
  balance,
  isUnlimited = false,
  cards,
  onPay,
  paying = false,
}: Props) {
  const { openPaywall } = usePaywall();
  const cfg = RITUAL_TYPES[ritualType];
  const canAfford = canAffordRunes({
    enabled: true,
    unlimited: isUnlimited,
    balance,
    cost,
  });
  const shortage = Math.max(0, cost - balance);

  const masterName = characterKey === "ragnar" ? "Рагнар" : "Агафья";

  return (
    <div className="px-5 py-6">
      <h3 className="text-center font-display text-lg font-bold text-white">
        {masterName} видит картину
      </h3>
      <p className="mt-3 text-center text-sm leading-relaxed text-white/70">
        Расклад из {cards.length} карт открывает путь к обряду «{cfg.label}».
        Карты говорят: {cards.map((c) => c.name).slice(0, 3).join(", ")}…
        Энергия готова — осталось получить персональный обряд.
      </p>

      <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 text-center">
        {isUnlimited ? (
          <>
            <p className="text-sm text-purple-200/80">∞ Безлимит активен</p>
            <p className="mt-1 text-lg font-bold text-purple-300">Обряд бесплатно</p>
          </>
        ) : (
          <>
            <p className="text-sm text-white/60">Стоимость обряда</p>
            <p className="mt-1 text-2xl font-bold text-amber-400">
              <RuneCost cost={cost} enabled />
            </p>
            <p className="mt-2 text-sm text-white/50">
              Ваш баланс:{" "}
              <span className={canAfford ? "text-emerald-400" : "text-red-400"}>
                {balance} ᚢ
              </span>
            </p>
          </>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          disabled={paying || !canAfford}
          onClick={onPay}
          className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block disabled:opacity-50"
        >
          {paying ? "Оплата…" : isUnlimited ? (
            "Получить обряд"
          ) : (
            <>Получить обряд — <RuneCost cost={cost} enabled className="inline" /></>
          )}
        </button>

        {!canAfford && !isUnlimited ? (
          <button
            type="button"
            onClick={() =>
              openPaywall({
                currentBalance: balance,
                requiredRunes: cost,
                shortage,
              })
            }
            className="w-full text-center text-sm text-amber-400 underline underline-offset-2"
          >
            Пополнить баланс
          </button>
        ) : null}
      </div>
    </div>
  );
}
