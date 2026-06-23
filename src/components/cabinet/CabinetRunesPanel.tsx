"use client";

import RuneIcon from "@/components/RuneIcon";
import { formatCabinetDate } from "@/lib/cabinet-utils";
import type { CabinetRuneTransaction } from "@/lib/cabinet-data";

interface Props {
  balance: number;
  enabled: boolean;
  transactions: CabinetRuneTransaction[];
  onTopUp?: () => void;
}

function typeIcon(type: string): string {
  switch (type) {
    case "purchase":
      return "🛒";
    case "spend":
      return "💬";
    case "achievement":
      return "🏆";
    case "daily_bonus":
      return "☀️";
    case "refund":
      return "🔄";
    case "bonus":
      return "✨";
    default:
      return "✦";
  }
}

function actionLabel(tx: CabinetRuneTransaction): string {
  if (tx.description) return tx.description;
  if (tx.actionType) return tx.actionType;
  return tx.type;
}

export default function CabinetRunesPanel({ balance, enabled, transactions, onTopUp }: Props) {
  if (!enabled) {
    return (
      <section id="cabinet-runes" className="cabinet-empty-state">
        Система рун временно недоступна.
      </section>
    );
  }

  return (
    <section id="cabinet-runes" className="space-y-5">
      <div className="cabinet-runes-balance">
        <div>
          <p className="cabinet-runes-balance__label">
            <RuneIcon className="h-4 w-4 text-amber-400/90" />
            Ваш баланс
          </p>
          <p className="cabinet-runes-balance__value">{balance} рун</p>
        </div>
        {onTopUp ? (
          <button type="button" onClick={onTopUp} className="cabinet-btn cabinet-btn--primary">
            Пополнить
          </button>
        ) : null}
      </div>

      <h2 className="text-lg font-semibold text-white">История операций</h2>

      {transactions.length === 0 ? (
        <p className="text-sm text-white/50">Пока нет операций с рунами.</p>
      ) : (
        <div className="cabinet-runes-history">
          {transactions.map((tx) => (
            <div key={tx.id} className="cabinet-runes-history__row">
              <span className="cabinet-runes-history__icon" aria-hidden>
                {typeIcon(tx.type)}
              </span>
              <span
                className={`cabinet-runes-history__amount ${
                  tx.amount >= 0 ? "cabinet-runes-history__amount--plus" : "cabinet-runes-history__amount--minus"
                }`}
              >
                {tx.amount >= 0 ? "+" : ""}
                {tx.amount}
              </span>
              <span className="cabinet-runes-history__desc">{actionLabel(tx)}</span>
              <span className="cabinet-runes-history__date">{formatCabinetDate(tx.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function CabinetRunesPanelSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
      <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}
