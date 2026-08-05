"use client";

import { useEffect, useState } from "react";

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
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-2xl text-[#ede6da]">Admin · Zovus Pro</h1>
      {err && <p className="mt-3 text-sm text-red-300">{err}</p>}
      <ul className="mt-6 space-y-3">
        {accounts.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#c9a24a]/20 px-4 py-3"
          >
            <div>
              <p className="text-[#ede6da]">{a.display_name || a.brand_slug}</p>
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
                  Approve
                </button>
              )}
              {a.status === "active" && (
                <button
                  type="button"
                  className="rounded border border-red-400/40 px-3 py-1 text-xs text-red-300"
                  onClick={() => void setStatus(a.id, "suspended")}
                >
                  Suspend
                </button>
              )}
              {a.status === "suspended" && (
                <button
                  type="button"
                  className="btn-neon px-3 py-1 text-xs"
                  onClick={() => void setStatus(a.id, "active")}
                >
                  Restore
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
