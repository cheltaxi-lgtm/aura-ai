"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable } from "@/components/admin/AdminShell";

export default function AdminPaymentsPage() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    fetch("/api/admin/payments").then((r) => r.json()).then((d) => setItems(d.items ?? []));
  }, []);

  return (
    <AdminShell>
      <AdminTitle title="Платежи" subtitle="ЮKassa / ЮMoney транзакции" />
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
