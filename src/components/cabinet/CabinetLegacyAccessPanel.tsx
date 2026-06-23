"use client";

import type { CabinetLegacyAccess } from "@/lib/cabinet-data";

interface Props {
  access: CabinetLegacyAccess;
  onOpenPaywall: () => void;
}

export default function CabinetLegacyAccessPanel({ access, onOpenPaywall }: Props) {
  const paidUntil = access.paidUntil ? new Date(access.paidUntil) : null;
  const hasSubscription = paidUntil && paidUntil > new Date();
  const subscriptionLabel = hasSubscription
    ? `Активна до ${paidUntil.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`
    : "Не активна";

  return (
    <section id="cabinet-access" className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Статус доступа</h2>
      <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white/50">Подписка Zovus+</p>
            <p className={`text-base font-medium ${hasSubscription ? "text-emerald-400" : "text-white/70"}`}>
              {subscriptionLabel}
            </p>
          </div>
          {!hasSubscription && (
            <button
              type="button"
              onClick={onOpenPaywall}
              className="cabinet-btn cabinet-btn--primary"
            >
              Подписаться · {access.subscriptionPrice} ₽
            </button>
          )}
        </div>
        <div className="border-t border-white/10 pt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white/50">Разовый доступ</p>
            <p className="text-base font-medium text-white/80">
              {access.hasSingleUnlock ? "Открыт для текущего сеанса" : "Не использован"}
            </p>
          </div>
          {!access.hasSingleUnlock && !hasSubscription && (
            <button
              type="button"
              onClick={onOpenPaywall}
              className="cabinet-btn cabinet-btn--secondary"
            >
              Открыть · {access.singlePrice} ₽
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
