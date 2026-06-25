"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn } from "@/components/admin/AdminShell";

export default function AdminPaymentsPage() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [paymentId, setPaymentId] = useState("");
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [reconcileNotice, setReconcileNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/payments").then((r) => r.json()).then((d) => setItems(d.items ?? []));
  }, []);

  const reconcilePayment = async () => {
    const id = paymentId.trim();
    if (!id) return;
    setReconcileBusy(true);
    setReconcileNotice(null);
    try {
      const res = await fetch("/api/admin/runes/reconcile", {
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
      } else {
        setReconcileNotice(data.error ?? "Ошибка восстановления");
      }
    } finally {
      setReconcileBusy(false);
    }
  };

  return (
    <AdminShell>
      <AdminTitle title="Платежи" subtitle="ЮKassa / ЮMoney транзакции" />

      <div className="glass-panel mb-6 p-4">
        <h2 className="text-sm font-semibold text-white">Восстановить оплату рун (ЮKassa)</h2>
        <p className="mt-1 text-xs text-gray-500">
          Если webhook не сработал — вставьте ID платежа из личного кабинета ЮKassa (формат
          2b4e…).
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
        headers={["Order ID", "Сумма", "Тип", "Статус", "Referrer", "Дата"]}
        rows={items.map((p) => [
          String(p.order_id ?? p.id).slice(0, 20),
          `${p.amount} ₽`,
          p.payment_type === "subscription" ? "Подписка" : "Разбор",
          p.status === "succeeded" ? <span className="text-aura-emerald">OK</span> : String(p.status),
          String(p.referrer_slug ?? "—"),
          new Date(String(p.created_at)).toLocaleString("ru-RU"),
        ])}
      />
    </AdminShell>
  );
}
