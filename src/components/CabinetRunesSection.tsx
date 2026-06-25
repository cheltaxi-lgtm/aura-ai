"use client";

import Link from "next/link";
import { Coins, ArrowDownLeft, ArrowUpRight, RotateCcw, Gift } from "lucide-react";
import { RUNE_ACTION_LABELS, type RuneActionType } from "@/lib/rune-costs";

export interface RuneTransactionRow {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  actionType?: string | null;
  createdAt: string;
}

interface CabinetRunesSectionProps {
  enabled: boolean;
  balance: number;
  transactions: RuneTransactionRow[];
}

function txIcon(type: string) {
  if (type === "purchase" || type === "bonus") return ArrowDownLeft;
  if (type === "refund") return RotateCcw;
  if (type === "spend") return ArrowUpRight;
  return Gift;
}

function txLabel(type: string) {
  if (type === "purchase") return "Пополнение";
  if (type === "bonus") return "Бонус";
  if (type === "refund") return "Возврат";
  if (type === "spend") return "Списание";
  return type;
}

function actionLabel(actionType?: string | null, description?: string) {
  if (actionType && actionType in RUNE_ACTION_LABELS) {
    return RUNE_ACTION_LABELS[actionType as RuneActionType];
  }
  return description || "Операция";
}

export default function CabinetRunesSection({
  enabled,
  balance,
  transactions,
}: CabinetRunesSectionProps) {
  if (!enabled) return null;

  const isLow = balance < 15;

  return (
    <section className="mb-8" id="руны">
      <h2 className="font-display mb-4 flex items-center gap-2 text-xl text-gray-300">
        <Coins className="h-5 w-5 text-aura-gold" /> Баланс рун
      </h2>

      <div className="glass-panel p-5">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Текущий баланс</p>
            <p
              className={`font-display mt-1 text-3xl font-bold ${
                isLow ? "text-amber-300" : "text-white"
              }`}
            >
              <span className="text-aura-gold">ᚢ</span> {balance}
            </p>
            {isLow && (
              <p className="mt-1 text-xs text-amber-400/90">Мало рун — пополните для расшифровок и вопросов</p>
            )}
          </div>
          <Link
            href="/?runeShop=1"
            className="btn-primary shrink-0 px-5 py-2.5 text-sm"
          >
            Пополнить руны
          </Link>
        </div>

        <h3 className="mb-3 text-sm font-medium text-gray-400">История операций</h3>

        {transactions.length === 0 ? (
          <p className="text-sm text-gray-600">Пока нет операций с рунами.</p>
        ) : (
          <ul className="divide-y divide-white/5 rounded-xl border border-white/5 bg-black/20">
            {transactions.map((tx) => {
              const Icon = txIcon(tx.type);
              const positive = tx.amount > 0;
              return (
                <li
                  key={tx.id}
                  className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        positive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-200">
                        {actionLabel(tx.actionType, tx.description)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {txLabel(tx.type)} ·{" "}
                        {new Date(tx.createdAt).toLocaleString("ru-RU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-semibold tabular-nums ${
                        positive ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {positive ? "+" : ""}
                      {tx.amount} ᚢ
                    </p>
                    <p className="text-[10px] text-gray-600">баланс {tx.balanceAfter} ᚢ</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
