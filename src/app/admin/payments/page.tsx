"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn } from "@/components/admin/AdminShell";

type PaymentRow = {
  id: string;
  order_id: string | null;
  amount: string;
  runes: string | null;
  payment_type: string;
  status: string;
  referrer_slug: string | null;
  user_email: string | null;
  source: string;
  created_at: string;
};

function paymentTypeLabel(type: string): string {
  if (type === "subscription") return "Подписка";
  if (type === "rune_purchase") return "Руны";
  return "Разбор";
}

export default function AdminPaymentsPage() {
  const [items, setItems] = useState<PaymentRow[]>([]);
  const [paymentId, setPaymentId] = useState("");
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [reconcileNotice, setReconcileNotice] = useState<string | null>(null);

  const loadPayments = () => {
    fetch("/api/admin/payments")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const reconcilePayment = async () => {
    const id = paymentId.trim();
    if (!id) return;
    setReconcileBusy(true);
    setReconcileNotice(null);
    try {
      const { adminFetch } = await import("@/lib/admin-fetch");
      const res = await adminFetch("/api/admin/runes/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReconcileNotice(
          data.credited
            ? `Руны начислены. Баланс пользователя: ${data.balance} ᚢ`
            : `Платёж уже был обработан ранее. Баланс: ${data.balance} ᚢ`
        );
        setPaymentId("");
        loadPayments();
      } else {
        setReconcileNotice(data.error ?? "Ошибка восстановления");
      }
    } finally {
      setReconcileBusy(false);
    }
  };

  return (
    <AdminShell>
      <AdminTitle
        title="Платежи"
        subtitle="ЮKassa: разборы, подписки и покупки рун (автоматически + cron каждые 15 мин)"
      />

      <div className="glass-panel mb-6 p-4">
        <h2 className="text-sm font-semibold text-white">Ручное восстановление (запасной вариант)</h2>
        <p className="mt-1 text-xs text-gray-500">
          Обычно не нужно: webhook, страница успеха и cron начисляют руны сами. ID платежа — из
          личного кабинета ЮKassa.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
            placeholder="ID платежа ЮKassa"
            className="min-w-[240px] flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
          <AdminBtn onClick={() => void reconcilePayment()} disabled={reconcileBusy}>
            {reconcileBusy ? "…" : "Начислить руны"}
          </AdminBtn>
        </div>
        {reconcileNotice && (
          <p className="mt-3 text-sm text-aura-emerald">{reconcileNotice}</p>
        )}
      </div>

      <AdminTable
        headers={["Order ID", "Сумма", "Руны", "Тип", "Пользователь", "Статус", "Referrer", "Дата"]}
        rows={items.map((p) => [
          String(p.order_id ?? p.id).slice(0, 24),
          `${p.amount} ₽`,
          p.runes ? `${p.runes} ᚢ` : "—",
          paymentTypeLabel(p.payment_type),
          p.user_email ?? "—",
          p.status === "succeeded" ? <span className="text-aura-emerald">OK</span> : String(p.status),
          String(p.referrer_slug ?? "—"),
          new Date(String(p.created_at)).toLocaleString("ru-RU"),
        ])}
      />
    </AdminShell>
  );
}
