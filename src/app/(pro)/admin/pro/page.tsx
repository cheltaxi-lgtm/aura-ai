"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle } from "@/components/admin/AdminShell";

type Acc = {
  id: string;
  display_name: string | null;
  status: string;
  brand_slug: string | null;
  user_id: string;
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

  async function setStatus(id: string, status: string) {
    await fetch("/api/pro/admin/accounts", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await load();
  }

  return (
    <AdminShell>
      <AdminTitle
        title="Zovus Pro"
        subtitle="Заявки и статусы аккаунтов практиков"
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
                {a.status} · {a.user_id}
              </p>
            </div>
            <div className="flex gap-2">
              {a.status === "pending" && (
                <button
                  type="button"
                  className="btn-neon px-3 py-1 text-xs"
                  onClick={() => void setStatus(a.id, "active")}
                >
                  Одобрить
                </button>
              )}
              {a.status === "active" && (
                <button
                  type="button"
                  className="rounded border border-red-400/40 px-3 py-1 text-xs text-red-300"
                  onClick={() => void setStatus(a.id, "suspended")}
                >
                  Приостановить
                </button>
              )}
              {a.status === "suspended" && (
                <button
                  type="button"
                  className="btn-neon px-3 py-1 text-xs"
                  onClick={() => void setStatus(a.id, "active")}
                >
                  Восстановить
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
