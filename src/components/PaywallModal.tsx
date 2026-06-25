"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, CreditCard, Smartphone, Loader2 } from "lucide-react";
import type { PaymentPlan } from "@/lib/yukassa";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";
import { DAILY_BONUS_AMOUNT } from "@/lib/rune-daily-constants";
import CustomRuneAmountField from "@/components/CustomRuneAmountField";

export interface RunePackage {
  id: string;
  name: string;
  runes: number;
  price_rub: number;
  bonus_runes: number;
  is_popular: boolean;
}

export interface PaywallOpenOptions {
  currentBalance?: number;
  requiredRunes?: number;
  balance?: number;
  shortage?: number;
  highlightPackageId?: string;
  sessionId?: string;
  userName?: string;
  onUnlocked?: () => void;
  onClose?: () => void | Promise<void>;
}

interface PaywallConfig {
  enabled: boolean;
  packages: RunePackage[];
  rubPerRune: number;
  legacyPrices: { single: number; subscription: number };
}

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: PaywallOpenOptions;
}

function pickHighlightPackage(packages: RunePackage[], shortage: number): string | undefined {
  if (shortage <= 0) return undefined;
  const sorted = [...packages].sort(
    (a, b) => a.runes + a.bonus_runes - (b.runes + b.bonus_runes)
  );
  return sorted.find((p) => p.runes + p.bonus_runes >= shortage)?.id;
}

function RuneShopView({
  packages,
  currentBalance,
  shortage,
  highlightPackageId,
  rubPerRune,
  onClose,
}: {
  packages: RunePackage[];
  currentBalance: number;
  shortage: number;
  highlightPackageId?: string;
  rubPerRune: number;
  onClose: () => void;
}) {
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bonusStatus, setBonusStatus] = useState<{
    available: boolean;
    nextBonusIn?: string;
  } | null>(null);
  const [claimingBonus, setClaimingBonus] = useState(false);

  const highlightId =
    highlightPackageId ?? pickHighlightPackage(packages, shortage);

  useEffect(() => {
    fetch("/api/runes/daily/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.available === "boolean") {
          setBonusStatus({ available: d.available, nextBonusIn: d.nextBonusIn });
        }
      })
      .catch(() => undefined);
  }, []);

  const claimBonus = async () => {
    setClaimingBonus(true);
    setError(null);
    try {
      const res = await fetch("/api/runes/daily", { method: "POST" });
      const data = await res.json();
      if (res.status === 429) {
        setError("Ежедневный бонус уже получен сегодня.");
        return;
      }
      if (data.claimed && typeof data.newBalance === "number") {
        emitRuneBalanceUpdate(data.newBalance);
        setBonusStatus({ available: false, nextBonusIn: data.nextBonusIn });
      } else if (data.alreadyClaimed) {
        setBonusStatus({ available: false, nextBonusIn: data.nextBonusIn });
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
      const res = await fetch("/api/runes/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError("Слишком много попыток покупки. Попробуйте позже.");
        setPurchasingId(null);
        return;
      }
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

  const handleCustomPurchase = async (amountRub: number) => {
    setPurchasingId("custom");
    setError(null);
    try {
      const res = await fetch("/api/runes/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customAmount: amountRub }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError("Слишком много попыток покупки. Попробуйте позже.");
        setPurchasingId(null);
        return;
      }
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
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 id="paywall-title" className="text-lg font-bold text-white">
          ᚢ Пополнить руны
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-gray-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {shortage > 0 ? (
        <p className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Не хватает {shortage} рун. Пополните баланс.
        </p>
      ) : null}

      <div className="space-y-3">
        {packages.map((pkg) => {
          const total = pkg.runes + pkg.bonus_runes;
          const highlighted = highlightId === pkg.id;
          return (
            <button
              key={pkg.id}
              type="button"
              onClick={() => void handlePurchase(pkg.id)}
              disabled={!!purchasingId}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 transition-all hover:scale-[1.01] disabled:opacity-60 ${
                highlighted
                  ? "border-amber-400 bg-amber-500/20 ring-2 ring-amber-400/50"
                  : pkg.is_popular
                    ? "border-amber-500/60 bg-amber-500/12"
                    : "border-white/10 bg-white/5"
              }`}
            >
              <div className="text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-white">{pkg.name}</span>
                  {pkg.is_popular && (
                    <span className="text-xs" aria-hidden>
                      🔥
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  {pkg.runes}
                  {pkg.bonus_runes > 0 ? `+${pkg.bonus_runes}` : ""} ᚢ
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

      {bonusStatus && (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">Ежедневный бонус</p>
              <p className="text-xs text-white/50">+{DAILY_BONUS_AMOUNT} ᚢ бесплатно</p>
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
              <span className="text-xs text-white/40">
                Через {bonusStatus.nextBonusIn ?? "—"}
              </span>
            )}
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-sm text-amber-400">
        Текущий баланс: {currentBalance} ᚢ
      </p>

      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-red-400">
          {error}
        </p>
      )}

      <p className="mt-4 text-center text-xs text-gray-600">
        Безопасная оплата ЮKassa · Руны без срока действия
      </p>
    </>
  );
}

function LegacyPaywallView({
  prices,
  sessionId,
  userName,
  onClose,
  onUnlocked,
}: {
  prices: { single: number; subscription: number };
  sessionId?: string;
  userName?: string;
  onClose: () => void;
  onUnlocked?: () => void;
}) {
  const [loading, setLoading] = useState<PaymentPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async (plan: PaymentPlan) => {
    if (!sessionId) {
      setError("Сначала начните сеанс с мастером");
      return;
    }
    setLoading(plan);
    setError(null);
    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, plan }),
      });
      const data = await res.json();
      if (data.confirmationUrl) {
        window.location.href = data.confirmationUrl;
        return;
      }
      setError(data.error ?? "Не удалось создать платёж");
      setLoading(null);
    } catch {
      setError("Ошибка соединения");
      setLoading(null);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 id="paywall-title" className="text-lg font-bold text-white">
          Доступ к мастеру
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-gray-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {userName ? (
        <p className="mb-4 text-center text-sm text-gray-400">
          {userName}, выберите способ доступа
        </p>
      ) : null}

      <div className="space-y-4">
        <button
          type="button"
          onClick={() => void handlePay("single")}
          disabled={loading !== null}
          className="flex w-full items-center gap-4 rounded-xl border border-aura-purple/40 bg-aura-purple/10 p-4 text-left hover:border-aura-purple disabled:opacity-50"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-aura-purple/20">
            {loading === "single" ? (
              <Loader2 className="h-6 w-6 animate-spin text-aura-neon" />
            ) : (
              <Smartphone className="h-6 w-6 text-aura-neon" />
            )}
          </div>
          <div className="flex-1">
            <p className="font-medium text-white">Разовый сеанс</p>
            <p className="text-xs text-gray-400">Один мастер, полный доступ</p>
          </div>
          <span className="text-xl font-bold text-aura-gold">{prices.single} ₽</span>
        </button>

        <button
          type="button"
          onClick={() => void handlePay("subscription")}
          disabled={loading !== null}
          className="flex w-full items-center gap-4 rounded-xl border border-aura-gold/40 bg-aura-gold/5 p-4 text-left hover:border-aura-gold disabled:opacity-50"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-aura-gold/20">
            {loading === "subscription" ? (
              <Loader2 className="h-6 w-6 animate-spin text-aura-gold" />
            ) : (
              <CreditCard className="h-6 w-6 text-aura-gold" />
            )}
          </div>
          <div className="flex-1">
            <p className="font-medium text-white">Подписка 30 дней</p>
            <p className="text-xs text-gray-400">Все мастера без ограничений</p>
          </div>
          <span className="text-xl font-bold text-aura-gold">{prices.subscription} ₽</span>
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-center text-sm text-red-400">
          {error}
        </p>
      )}

      {onUnlocked ? (
        <button
          type="button"
          onClick={onUnlocked}
          className="mt-4 w-full text-sm text-gray-500 underline"
        >
          Уже оплатил — обновить
        </button>
      ) : null}

      <p className="mt-4 text-center text-xs text-gray-600">Оплата через ЮKassa</p>
    </>
  );
}

export default function PaywallModal({ isOpen, onClose, options }: PaywallModalProps) {
  const [config, setConfig] = useState<PaywallConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const balance = options.currentBalance ?? options.balance ?? 0;
  const required = options.requiredRunes ?? 0;
  const shortage = useMemo(
    () => options.shortage ?? Math.max(0, required - balance),
    [options.shortage, required, balance]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add("paywall-modal-open");
    return () => {
      document.body.classList.remove("paywall-modal-open");
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch("/api/runes/config")
      .then((r) => r.json())
      .then((d) => {
        setConfig({
          enabled: Boolean(d.enabled),
          packages: d.packages ?? [],
          rubPerRune: Number(d.rubPerRune) || 2,
          legacyPrices: d.legacyPrices ?? { single: 199, subscription: 590 },
        });
      })
      .catch(() =>
        setConfig({
          enabled: true,
          packages: [],
          rubPerRune: 2,
          legacyPrices: { single: 199, subscription: 590 },
        })
      )
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="paywall-modal-root">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[5001] bg-black/70 backdrop-blur-sm pointer-events-auto"
            aria-hidden
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="paywall-title"
            className="fixed bottom-0 left-0 right-0 z-[5001] mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#12101a] p-6 pointer-events-auto"
          >
            {loading || !config ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                <p className="text-sm text-white/50">Загрузка…</p>
              </div>
            ) : config.enabled ? (
              <RuneShopView
                packages={config.packages}
                currentBalance={balance}
                shortage={shortage}
                highlightPackageId={options.highlightPackageId}
                rubPerRune={config.rubPerRune}
                onClose={onClose}
              />
            ) : (
              <LegacyPaywallView
                prices={config.legacyPrices}
                sessionId={options.sessionId}
                userName={options.userName}
                onClose={onClose}
                onUnlocked={options.onUnlocked}
              />
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
