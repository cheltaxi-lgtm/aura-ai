"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchRuneConfig } from "@/lib/useRuneConfig";

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
  const [rubPerRune, setRubPerRune] = useState(2);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    void fetchRuneConfig().then((c) => setRubPerRune(c.rubPerRune));
    fetch("/api/runes/packages")
      .then((r) => r.json())
      .then((d) => setPackages(d.packages ?? []))
      .catch(() => setError("Не удалось загрузить пакеты"));
  }, [isOpen]);

  const handlePurchase = async (packageId: string) => {
    setPurchasingId(packageId);
    setError(null);
    try {
      const res = await fetch("/api/runes/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json();
      if (!res.ok || !data.paymentUrl) {
        setError(data.error ?? "Ошибка оплаты");
        setPurchasingId(null);
        return;
      }
      localStorage.setItem("aura_runes_before_purchase", String(currentBalance));
      window.location.href = data.paymentUrl;
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
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-h-[90vh] max-w-lg overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#12101a] p-6"
          >
            <div className="mb-6 text-center">
              <p className="mb-2 text-4xl">ᚢ</p>
              <h2 className="text-lg font-bold text-white">Получить руны</h2>
              {requiredRunes !== undefined && requiredRunes > currentBalance ? (
                <p className="mt-1 text-sm text-amber-400">
                  Нужно ещё {requiredRunes - currentBalance} ᚢ для этого действия
                </p>
              ) : (
                <p className="mt-1 text-sm text-gray-400">Ваш баланс: {currentBalance} ᚢ</p>
              )}
            </div>

            <div className="space-y-3">
              {packages.map((pkg) => {
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

            {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}

            <p className="mt-4 text-center text-xs text-gray-600">
              Руны не имеют срока действия · Безопасная оплата ЮKassa
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
