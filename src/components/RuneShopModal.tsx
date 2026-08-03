"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchRuneConfig } from "@/lib/useRuneConfig";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";
import { DAILY_BONUS_AMOUNT } from "@/lib/rune-daily-constants";
import CustomRuneAmountField from "@/components/CustomRuneAmountField";
import { attachRecaptchaToken } from "@/lib/client-recaptcha";
import { fetchPlatformFeatures } from "@/lib/usePlatformFeatures";
import { storePendingRunePurchase } from "@/lib/rune-purchase-client";
import { pushEcommerceAdd, pushEcommerceDetail } from "@/lib/seo/ecommerce";
import { trackPaywallOpen } from "@/lib/seo/metrika";
import LegalOfferNotice from "@/components/legal/LegalOfferNotice";
import { openTelegramExternalUrl } from "@/components/telegram/TelegramWebAppProvider";

interface RunePackage {
  id: string;
  name: string;
  runes: number;
  price_rub: number;
  bonus_runes: number;
  is_popular: boolean;
}

interface RuneShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  requiredRunes?: number;
}

export default function RuneShopModal({
  isOpen,
  onClose,
  currentBalance,
  requiredRunes,
}: RuneShopModalProps) {
  const [packages, setPackages] = useState<RunePackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [rubPerRune, setRubPerRune] = useState(2);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bonusStatus, setBonusStatus] = useState<{
    available: boolean;
    nextBonusIn?: string;
  } | null>(null);
  const [claimingBonus, setClaimingBonus] = useState(false);

  const loadBonusStatus = useCallback(() => {
    fetch("/api/runes/daily/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.available === "boolean") {
          setBonusStatus({ available: d.available, nextBonusIn: d.nextBonusIn });
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setPackagesLoading(true);
    setError(null);
    loadBonusStatus();
    void fetchRuneConfig().then((c) => setRubPerRune(c.rubPerRune));
    fetch("/api/runes/packages")
      .then((r) => r.json())
      .then((d) => {
        const loaded: RunePackage[] = d.packages ?? [];
        setPackages(loaded);
        trackPaywallOpen("rune_shop_modal");
        pushEcommerceDetail(
          loaded.map((pkg) => ({
            id: pkg.id,
            name: pkg.name,
            price: pkg.price_rub,
            category: "runes",
          }))
        );
      })
      .catch(() => setError("Не удалось загрузить пакеты"))
      .finally(() => setPackagesLoading(false));
  }, [isOpen, loadBonusStatus]);

  const claimBonus = async () => {
    setClaimingBonus(true);
    setError(null);
    try {
      const res = await fetch("/api/runes/daily", { method: "POST" });
      const data = await res.json();
      if (data.claimed && typeof data.newBalance === "number") {
        emitRuneBalanceUpdate(data.newBalance);
        loadBonusStatus();
      } else if (data.alreadyClaimed) {
        setBonusStatus({
          available: false,
          nextBonusIn: data.nextBonusIn ?? undefined,
        });
      } else if (!res.ok) {
        setError(data.error ?? "Не удалось получить бонус");
      }
    } catch {
      setError("Ошибка соединения");
    } finally {
      setClaimingBonus(false);
    }
  };

  const handlePurchase = async (packageId: string) => {
    setPurchasingId(packageId);
    setError(null);
    try {
      const features = await fetchPlatformFeatures();
      const payload: Record<string, unknown> = { packageId };
      const captchaErr = await attachRecaptchaToken(payload, "payments", features);
      if (captchaErr) {
        setError(captchaErr);
        setPurchasingId(null);
        return;
      }

      const res = await fetch("/api/runes/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.paymentUrl) {
        setError(data.error ?? "Ошибка оплаты");
        setPurchasingId(null);
        return;
      }
      storePendingRunePurchase(typeof data.paymentId === "string" ? data.paymentId : "", currentBalance);
      const pkg = packages.find((p) => p.id === packageId);
      if (pkg) {
        pushEcommerceAdd({ id: pkg.id, name: pkg.name, price: pkg.price_rub, category: "runes" });
      }
      openTelegramExternalUrl(data.paymentUrl);
    } catch {
      setError("Ошибка соединения");
      setPurchasingId(null);
    }
  };

  const handleCustomPurchase = async (amountRub: number) => {
    setPurchasingId("custom");
    setError(null);
    try {
      const features = await fetchPlatformFeatures();
      const payload: Record<string, unknown> = { customAmount: amountRub };
      const captchaErr = await attachRecaptchaToken(payload, "payments", features);
      if (captchaErr) {
        setError(captchaErr);
        setPurchasingId(null);
        return;
      }

      const res = await fetch("/api/runes/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.paymentUrl) {
        setError(data.error ?? "Ошибка оплаты");
        setPurchasingId(null);
        return;
      }
      storePendingRunePurchase(typeof data.paymentId === "string" ? data.paymentId : "", currentBalance);
      pushEcommerceAdd({ id: "custom", name: "Произвольная сумма", price: amountRub, category: "runes" });
      openTelegramExternalUrl(data.paymentUrl);
    } catch {
      setError("Ошибка соединения");
      setPurchasingId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rune-shop-title"
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-3xl border-t border-[rgba(201,162,74,0.2)] bg-[#141210] p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex-1" />
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть магазин рун"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-gray-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple"
              >
                ✕
              </button>
            </div>
            <div className="mb-6 text-center">
              <p className="mb-2 text-4xl">ᚢ</p>
              <h2 id="rune-shop-title" className="text-lg font-bold text-white">
                Получить руны
              </h2>
              {requiredRunes !== undefined && requiredRunes > currentBalance ? (
                <p className="mt-1 text-sm text-amber-400">
                  Нужно ещё {requiredRunes - currentBalance} ᚢ для этого действия
                </p>
              ) : (
                <p className="mt-1 text-sm text-gray-400">Ваш баланс: {currentBalance} ᚢ</p>
              )}
            </div>

            {bonusStatus && (
              <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl leading-none">ᚢ</span>
                    <div>
                      <p className="text-sm font-medium text-white">Ежедневный бонус</p>
                      <p className="text-xs text-white/50">
                        +{DAILY_BONUS_AMOUNT} рун каждый день бесплатно
                      </p>
                    </div>
                  </div>
                  {bonusStatus.available ? (
                    <button
                      type="button"
                      onClick={() => void claimBonus()}
                      disabled={claimingBonus}
                            className="btn-luxe btn-luxe--sm btn-luxe--gold disabled:opacity-60"
                    >
                      {claimingBonus ? "…" : "Забрать"}
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs text-white/40">
                      Через {bonusStatus.nextBonusIn ?? "—"}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {packagesLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={`sk-${i}`}
                    className="h-[72px] animate-pulse rounded-2xl border border-white/10 bg-white/5"
                  />
                ))}
              {!packagesLoading &&
                packages.map((pkg) => {
                const total = pkg.runes + pkg.bonus_runes;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => void handlePurchase(pkg.id)}
                    disabled={!!purchasingId}
                    className={`flex w-full items-center justify-between rounded-2xl border p-4 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 ${
                      pkg.is_popular
                        ? "border-amber-500/60 bg-amber-500/12"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">{pkg.name}</span>
                        {pkg.is_popular && (
                          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-black">
                            хит
                          </span>
                        )}
                        {pkg.bonus_runes > 0 && (
                          <span className="rounded-full bg-green-500/30 px-2 py-0.5 text-[10px] text-green-400">
                            +{pkg.bonus_runes} бонус
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">
                        ᚢ {total} рун · ~{(pkg.price_rub / total).toFixed(1)} ₽/руна
                        {rubPerRune > 0 && (
                          <span className="text-gray-600">
                            {" "}
                            (курс {rubPerRune} ₽/ᚢ)
                          </span>
                        )}
                      </p>
                    </div>
                    {purchasingId === pkg.id ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                    ) : (
                      <span className="font-bold text-white">{pkg.price_rub} ₽</span>
                    )}
                  </button>
                );
              })}
            </div>

            <CustomRuneAmountField
              rubPerRune={rubPerRune}
              onPurchaseSubmit={(amountRub) => void handleCustomPurchase(amountRub)}
              purchasing={purchasingId === "custom"}
              disabled={!!purchasingId && purchasingId !== "custom"}
            />

            {error && (
              <p role="alert" className="mt-3 text-center text-sm text-red-400">
                {error}
              </p>
            )}

            <LegalOfferNotice className="mt-4" />
            <p className="mt-2 text-center text-xs text-gray-600">
              Руны не имеют срока действия · Безопасная оплата ЮKassa
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
