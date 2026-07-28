"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";

type Item = {
  id: string;
  kind: string;
  current_value: unknown;
  proposed_value: unknown;
  rationale_json: unknown;
  status: string;
  created_at: string;
  expires_at: string | null;
};

function fmt(v: unknown): string {
  if (v == null) return "—";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export default function AdsApprovalsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [pending, setPending] = useState(0);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/ads/admin/approvals")
      .then(async (r) => {
        if (r.status === 404) {
          setDisabled(true);
          return;
        }
        if (!r.ok) return;
        const d = await r.json();
        setItems(d.items ?? []);
        setPending(d.pending ?? 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, decision: "apply" | "reject") => {
    setBusy(id);
    try {
      const res = await fetch("/api/ads/admin/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      if (res.ok) load();
    } finally {
      setBusy(null);
    }
  };

  if (disabled) return <AdsDisabled />;

  return (
    <AdminShell>
      <AdminTitle title="Апрувы" subtitle="Очередь изменений, требующих подтверждения" />
      <AdsAdminNav pendingApprovals={pending} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <StatCard label="В очереди" value={pending} accent="text-aura-gold" />
        <StatCard label="Всего в ленте" value={items.length} />
      </div>

      <AdminTable
        headers={["Тип", "Текущее → предлагаемое", "Обоснование", "TTL", "Статус", ""]}
        rows={items.map((it) => [
          it.kind,
          <span key="v" className="text-xs">
            <span className="text-gray-500">{fmt(it.current_value)}</span>
            {" → "}
            <span className="text-aura-gold">{fmt(it.proposed_value)}</span>
          </span>,
          <span key="r" className="text-xs text-gray-500">
            {fmt(it.rationale_json)}
          </span>,
          it.expires_at ? new Date(it.expires_at).toLocaleString("ru-RU") : "—",
          it.status,
          it.status === "pending" ? (
            <span key="a" className="flex gap-2">
              <AdminBtn disabled={busy === it.id} onClick={() => void decide(it.id, "apply")}>
                Применить
              </AdminBtn>
              <AdminBtn
                variant="danger"
                disabled={busy === it.id}
                onClick={() => void decide(it.id, "reject")}
              >
                Отклонить
              </AdminBtn>
            </span>
          ) : (
            "—"
          ),
        ])}
      />
    </AdminShell>
  );
}
