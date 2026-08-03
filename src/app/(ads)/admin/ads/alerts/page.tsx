"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";

type Alert = {
  id: string;
  severity: string;
  code: string;
  message: string;
  acknowledged_at: string | null;
  created_at: string;
};

export default function AdsAlertsPage() {
  const [items, setItems] = useState<Alert[]>([]);
  const [unacked, setUnacked] = useState(0);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/ads/admin/alerts")
      .then(async (r) => {
        if (r.status === 404) {
          setDisabled(true);
          return;
        }
        if (!r.ok) return;
        const d = await r.json();
        setItems(d.items ?? []);
        setUnacked(d.unacked ?? 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ack = async (id?: string) => {
    setBusy(true);
    try {
      await fetch("/api/ads/admin/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { action: "ack_all" }),
      });
      load();
    } finally {
      setBusy(false);
    }
  };

  if (disabled) return <AdsDisabled />;

  const sevColor = (s: string) =>
    s === "critical" ? "text-red-400" : s === "warning" ? "text-amber-400" : "text-gray-400";

  return (
    <AdminShell>
      <AdminTitle title="Алерты" subtitle="Лента ads.alert · подтверждение прочтения" />
      <AdsAdminNav />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <StatCard label="Непрочитанные" value={unacked} accent="text-amber-300" />
        <AdminBtn disabled={busy || unacked === 0} onClick={() => void ack()}>
          Прочитать все
        </AdminBtn>
      </div>

      <AdminTable
        headers={["Время", "Severity", "Code", "Сообщение", ""]}
        rows={items.map((a) => [
          new Date(a.created_at).toLocaleString("ru-RU"),
          <span key="s" className={sevColor(a.severity)}>
            {a.severity}
          </span>,
          a.code,
          a.message,
          a.acknowledged_at ? (
            <span className="text-gray-600">OK</span>
          ) : (
            <AdminBtn key="a" disabled={busy} onClick={() => void ack(a.id)}>
              Ack
            </AdminBtn>
          ),
        ])}
      />
    </AdminShell>
  );
}
