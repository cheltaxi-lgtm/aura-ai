"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";

type Impact = {
  currentRub: number | null;
  proposedRub: number | null;
  deltaDayRub: number | null;
  delta30dRub: number | null;
  budgetRemainRub: number | null;
  daysAfterApply: number | null;
  requiresTypedConfirm: boolean;
};

type Item = {
  id: string;
  kind: string;
  current_value: unknown;
  proposed_value: unknown;
  rationale_json: unknown;
  status: string;
  created_at: string;
  expires_at: string | null;
  impact?: Impact;
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
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/ads/admin/approvals")
      .then(async (r) => {
        if (r.status === 404) {
          setDisabled(true);
          return;
        }
        if (!r.ok) {
          setError(`HTTP ${r.status}`);
          return;
        }
        const d = await r.json();
        setItems(d.items ?? []);
        setPending(d.pending ?? 0);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "network"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, decision: "apply" | "reject", confirmAmount?: number) => {
    setBusy(id);
    setError(null);
    try {
      const { adminFetch } = await import("@/lib/admin-fetch");
      const res = await adminFetch("/api/ads/admin/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, confirmAmount }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? `Ошибка ${res.status}`);
        return;
      }
      setConfirmId(null);
      setConfirmInput("");
      load();
    } finally {
      setBusy(null);
    }
  };

  const onApplyClick = (it: Item) => {
    if (it.impact?.requiresTypedConfirm) {
      setConfirmId(it.id);
      setConfirmInput("");
      return;
    }
    void decide(it.id, "apply");
  };

  if (disabled) return <AdsDisabled />;

  return (
    <AdminShell>
      <AdminTitle title="Апрувы" subtitle="Очередь изменений, требующих подтверждения" />
      <AdsAdminNav pendingApprovals={pending} />

      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <StatCard label="В очереди" value={pending} accent="text-aura-gold" />
        <StatCard label="Всего в ленте" value={items.length} />
      </div>

      <AdminTable
        headers={["Тип", "Текущее → предлагаемое", "Δ / остаток", "TTL", "Статус", ""]}
        rows={items.map((it) => [
          it.kind,
          <span key="v" className="text-xs">
            <span className="text-gray-500">{fmt(it.current_value)}</span>
            {" → "}
            <span className="text-aura-gold">{fmt(it.proposed_value)}</span>
          </span>,
          <span key="i" className="text-xs text-gray-400">
            {it.impact?.deltaDayRub != null
              ? `Δдень ${Math.round(it.impact.deltaDayRub)} · Δ30д ${Math.round(it.impact.delta30dRub ?? 0)}`
              : "—"}
            {it.impact?.budgetRemainRub != null
              ? ` · остаток ${Math.round(it.impact.budgetRemainRub)}`
              : ""}
            {it.impact?.daysAfterApply != null
              ? ` · ~${Math.round(it.impact.daysAfterApply)} дн.`
              : ""}
            {it.impact?.requiresTypedConfirm ? (
              <span className="ml-1 text-amber-400">×2+</span>
            ) : null}
          </span>,
          it.expires_at ? new Date(it.expires_at).toLocaleString("ru-RU") : "—",
          it.status,
          it.status === "pending" ? (
            <span key="a" className="flex flex-col gap-2">
              {confirmId === it.id ? (
                <span className="flex flex-col gap-1">
                  <input
                    type="number"
                    placeholder={`Введите ${it.impact?.proposedRub ?? ""}`}
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    className="w-28 rounded border border-white/20 bg-black/40 px-2 py-1 text-xs text-white"
                  />
                  <AdminBtn
                    disabled={busy === it.id}
                    onClick={() =>
                      void decide(it.id, "apply", Number(confirmInput))
                    }
                  >
                    Подтвердить
                  </AdminBtn>
                </span>
              ) : (
                <AdminBtn disabled={busy === it.id} onClick={() => onApplyClick(it)}>
                  Применить
                </AdminBtn>
              )}
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
