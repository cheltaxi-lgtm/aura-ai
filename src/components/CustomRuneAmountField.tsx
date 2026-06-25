"use client";

import { useMemo, useState } from "react";
import {
  MAX_CUSTOM_RUNE_PURCHASE_RUB,
  MIN_CUSTOM_RUNE_PURCHASE_RUB,
  parseCustomRubAmount,
  runesFromRubAmount,
} from "@/lib/rune-purchase-constants";

interface CustomRuneAmountFieldProps {
  rubPerRune: number;
  onPurchaseSubmit: (amountRub: number) => void;
  purchasing: boolean;
  disabled?: boolean;
}

const BLOCKED_KEYS = new Set(["e", "E", "+", "-", ".", ",", " "]);

export default function CustomRuneAmountField({
  rubPerRune,
  onPurchaseSubmit,
  purchasing,
  disabled = false,
}: CustomRuneAmountFieldProps) {
  const [customAmount, setCustomAmount] = useState("");
  const [showMaxHint, setShowMaxHint] = useState(false);

  const amountRub = useMemo(() => parseCustomRubAmount(customAmount), [customAmount]);

  const runesPreview = runesFromRubAmount(amountRub, rubPerRune);
  const canPay =
    amountRub >= MIN_CUSTOM_RUNE_PURCHASE_RUB &&
    amountRub <= MAX_CUSTOM_RUNE_PURCHASE_RUB &&
    runesPreview > 0 &&
    !showMaxHint &&
    !disabled &&
    !purchasing;

  const applyDigits = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setShowMaxHint(false);
      setCustomAmount("");
      return;
    }
    const n = parseInt(digits, 10);
    if (!Number.isFinite(n)) return;
    if (n > MAX_CUSTOM_RUNE_PURCHASE_RUB) {
      setShowMaxHint(true);
      setCustomAmount(String(MAX_CUSTOM_RUNE_PURCHASE_RUB));
      return;
    }
    setShowMaxHint(false);
    setCustomAmount(String(n));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (BLOCKED_KEYS.has(e.key)) {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (
      e.key === "Backspace" ||
      e.key === "Delete" ||
      e.key === "Tab" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "Home" ||
      e.key === "End"
    ) {
      return;
    }
    if (e.key.length === 1 && !/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyDigits(e.target.value);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    applyDigits(e.clipboardData.getData("text"));
  };

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
      <label htmlFor="custom-rune-amount" className="text-sm font-medium text-white">
        Другая сумма (₽)
      </label>
      <input
        id="custom-rune-amount"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={`от ${MIN_CUSTOM_RUNE_PURCHASE_RUB} ₽`}
        value={customAmount}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={disabled || purchasing}
        className="ui-input mt-2 w-full"
        aria-describedby="custom-rune-hint"
      />
      <div id="custom-rune-hint">
        {showMaxHint ? (
          <p className="mt-1.5 text-xs text-amber-400/90">
            Максимальная сумма пополнения — 50 000 ₽
          </p>
        ) : amountRub > 0 && amountRub < MIN_CUSTOM_RUNE_PURCHASE_RUB ? (
          <p className="mt-1.5 text-xs text-amber-400/90">
            Минимальная сумма — {MIN_CUSTOM_RUNE_PURCHASE_RUB} ₽
          </p>
        ) : runesPreview > 0 ? (
          <p className="mt-1.5 truncate break-words text-xs text-gray-500">
            Вы получите: {runesPreview} рун
            {rubPerRune > 0 ? (
              <span className="text-gray-600"> · {rubPerRune} ₽/ᚢ</span>
            ) : null}
          </p>
        ) : amountRub >= MIN_CUSTOM_RUNE_PURCHASE_RUB ? (
          <p className="mt-1.5 text-xs text-gray-500">Сумма слишком мала для начисления рун</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => canPay && onPurchaseSubmit(amountRub)}
        disabled={!canPay}
        className="btn-luxe btn-luxe--gold mt-3 w-full disabled:opacity-50"
      >
        {purchasing ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            Оформление…
          </span>
        ) : amountRub >= MIN_CUSTOM_RUNE_PURCHASE_RUB && amountRub <= MAX_CUSTOM_RUNE_PURCHASE_RUB ? (
          `Оплатить ${amountRub} ₽`
        ) : (
          "Оплатить"
        )}
      </button>
    </div>
  );
}
