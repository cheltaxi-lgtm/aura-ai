"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle } from "@/components/admin/AdminShell";

type Acc = {
  id: string;
  display_name: string | null;
  status: string;
  tier: "free_trial" | "pro";
  brand_slug: string | null;
  user_id: string;
  limits?: {
    trial_ends_at?: string;
    trial_runes?: number;
  } | null;
};

export default function AdminProPage() {
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/pro/admin/accounts", { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Нет доступа");
      return;
    }
    setAccounts(json.accounts || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch("/api/pro/admin/accounts", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setErr(typeof json.error === "string" ? json.error : "Не удалось сохранить");
    }
    await load();
  }

  async function extendTrial(a: Acc) {
    const current = a.limits?.trial_ends_at;
    const base = current && Date.parse(current) > Date.now() ? new Date(current) : new Date();
    base.setUTCDate(base.getUTCDate() + 14);
    await patch({ id: a.id, tier: "free_trial", trialEndsAt: base.toISOString() });
  }

  return (
    <AdminShell>
      <AdminTitle
        title="Zovus Pro"
        subtitle="Заявки, статусы и тарифы аккаунтов практиков"
      />
      {err && <p className="mb-4 text-sm text-red-300">{err}</p>}
      <ul className="space-y-3">
        {accounts.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-aura-gold/20 bg-black/20 px-4 py-3"
          >
            <div>
              <p className="text-aura-ivory">{a.display_name || a.brand_slug}</p>
              <p className="text-xs text-gray-500">
                {a.status} · {a.tier === "pro" ? "Pro" : "Триал"}
                {a.tier === "free_trial" && a.limits?.trial_ends_at
                  ? ` до ${new Date(a.limits.trial_ends_at).toLocaleDateString("ru-RU")}`
                  : ""}
                {" · "}
                {a.user_id}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {a.status === "pending" && (
                <button
                  type="button"
                  className="btn-neon px-3 py-1 text-xs"
                  onClick={() => void patch({ id: a.id, status: "active" })}
                >
                  Одобрить
                </button>
              )}
              {a.status === "active" && (
                <button
                  type="button"
                  className="rounded border border-red-400/40 px-3 py-1 text-xs text-red-300"
                  onClick={() => void patch({ id: a.id, status: "suspended" })}
                >
                  Приостановить
                </button>
              )}
              {a.status === "suspended" && (
                <button
                  type="button"
                  className="btn-neon px-3 py-1 text-xs"
                  onClick={() => void patch({ id: a.id, status: "active" })}
                >
                  Восстановить
                </button>
              )}
              {a.tier === "free_trial" ? (
                <>
                  <button
                    type="button"
                    className="rounded border border-aura-gold/40 px-3 py-1 text-xs text-aura-champagne"
                    onClick={() => void patch({ id: a.id, tier: "pro" })}
                  >
                    → Pro
                  </button>
                  <button
                    type="button"
                    className="rounded border border-aura-gold/20 px-3 py-1 text-xs text-gray-300"
                    onClick={() => void extendTrial(a)}
                  >
                    +14 дней триала
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="rounded border border-aura-gold/20 px-3 py-1 text-xs text-gray-300"
                  onClick={() => void patch({ id: a.id, tier: "free_trial" })}
                >
                  → Триал
                </button>
              )}
            </div>
          </li>
        ))}
        {!err && accounts.length === 0 ? (
          <li className="text-sm text-gray-500">Пока нет заявок</li>
        ) : null}
      </ul>
    </AdminShell>
  );
}
