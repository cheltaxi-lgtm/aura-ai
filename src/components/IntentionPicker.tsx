"use client";

import { INTENTION_OPTIONS, getIntentionMeta } from "@/lib/intention";
export type { SessionIntention } from "@/lib/intention";

import { useState } from "react";
import { motion } from "framer-motion";
import type { SessionIntention } from "@/lib/intention";

export type IntentionStartMode = "existing" | "fresh";

interface IntentionPickerProps {
  masterName?: string;
  spreadCost?: number;
  runeBalance?: number;
  runeBillingEnabled?: boolean;
  loading?: boolean;
  onSelect: (intention: SessionIntention, mode: IntentionStartMode) => void;
  onSkip: () => void;
}

export default function IntentionPicker({
  masterName,
  spreadCost = 20,
  runeBalance = 0,
  runeBillingEnabled = true,
  loading = false,
  onSelect,
  onSkip,
}: IntentionPickerProps) {
  const [selected, setSelected] = useState<SessionIntention | null>(null);
  const canAffordFresh = !runeBillingEnabled || runeBalance >= spreadCost;

  return (
    <div className="relative mx-auto max-w-2xl px-4 py-8">
      <button
        type="button"
        onClick={onSkip}
        disabled={loading}
        className="absolute right-4 top-4 text-sm text-gray-500 transition-colors hover:text-white disabled:opacity-40"
      >
        Пропустить
      </button>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h2 className="font-display text-2xl font-bold text-white">Намерение сеанса</h2>
        <p className="mt-2 text-sm text-gray-400">
          {masterName
            ? `${masterName} услышит, о чём вы пришли`
            : "Выберите тему — мастер начнёт с неё"}
        </p>
      </motion.div>

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {INTENTION_OPTIONS.map((card) => {
          const isSelected = selected === card.id;
          return (
            <motion.button
              key={card.id}
              type="button"
              disabled={loading}
              onClick={() => setSelected(card.id)}
              animate={{
                scale: isSelected ? 1.05 : selected ? 0.95 : 1,
                opacity: selected && !isSelected ? 0.3 : 1,
              }}
              transition={{ duration: 0.2 }}
              className={`rounded-2xl border p-5 text-center transition-colors disabled:opacity-50 ${
                isSelected
                  ? "border-amber-500/60 bg-gradient-to-b from-amber-900/30 to-black/60 shadow-lg shadow-amber-500/10"
                  : "border-white/10 bg-black/30 hover:border-white/20"
              }`}
            >
              <span className="text-3xl">{card.icon}</span>
              <p className={`mt-2 text-sm font-medium ${isSelected ? "text-amber-300" : "text-gray-300"}`}>
                {card.label}
              </p>
            </motion.button>
          );
        })}
      </div>

      {selected && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-10 flex flex-col items-center gap-4"
        >
          <div className="max-w-md text-center">
            <p className="text-sm text-amber-200/90">
              {masterName ?? "Мастер"} настроит сеанс на «{getIntentionMeta(selected).label.toLowerCase()}»
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Фокус: {getIntentionMeta(selected).focus}
            </p>
          </div>

          <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={loading}
              onClick={() => onSelect(selected, "existing")}
              className="btn-ghost flex-1 px-4 py-3 text-sm disabled:opacity-50"
            >
              С текущим раскладом
            </button>
            <button
              type="button"
              disabled={loading || !canAffordFresh}
              onClick={() => onSelect(selected, "fresh")}
              className="btn-primary flex-1 px-4 py-3 text-sm disabled:opacity-50"
            >
              {loading
                ? "Вытягиваем…"
                : runeBillingEnabled
                  ? `Новый расклад · ${spreadCost} ᚢ`
                  : "Новый расклад на тему"}
            </button>
          </div>

          {runeBillingEnabled && !canAffordFresh ? (
            <p className="text-center text-xs text-amber-400/80">
              Нужно {spreadCost} ᚢ · у вас {runeBalance} ᚢ — пополните баланс или выберите текущий расклад
            </p>
          ) : (
            <p className="text-center text-[11px] text-gray-500">
              «Новый расклад» — 3 символа, вытянутые под тему, с расшифровкой мастера
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}
