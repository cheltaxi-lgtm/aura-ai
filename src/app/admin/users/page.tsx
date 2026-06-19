"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn } from "@/components/admin/AdminShell";

export default function AdminUsersPage() {
  const [tab, setTab] = useState<"accounts" | "profiles">("accounts");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/admin/users?type=${tab}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
  };

  useEffect(load, [tab]);

  const deleteUser = async (id: string) => {
    if (!confirm("Удалить аккаунт?")) return;
    await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const toggleUnlimited = async (id: string, next: boolean) => {
    setBusyId(id);
    try {
      await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isUnlimited: next }),
      });
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminShell>
      <AdminTitle title="Пользователи" subtitle="Аккаунты и профили онбординга" />
      <div className="mb-4 flex gap-2">
        {(["accounts", "profiles"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm ${tab === t ? "bg-aura-purple/20 text-aura-neon" : "text-gray-500 hover:text-white"}`}
          >
            {t === "accounts" ? "Аккаунты" : "Профили"}
          </button>
        ))}
      </div>

      {tab === "accounts" ? (
        <AdminTable
          headers={["Email", "Имя", "Профиль", "Знак", "Сессий", "Безлимит", "Создан", ""]}
          rows={items.map((u) => {
            const id = String(u.id);
            const unlimited = Boolean(u.is_unlimited);
            return [
              String(u.email),
              String(u.name),
              String(u.profile_name ?? "—"),
              String(u.zodiac ?? "—"),
              String(u.sessions_count ?? "0"),
              <button
                key="u"
                type="button"
                disabled={busyId === id}
                onClick={() => void toggleUnlimited(id, !unlimited)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  unlimited
                    ? "bg-aura-emerald/20 text-aura-emerald hover:bg-aura-emerald/30"
                    : "border border-white/10 text-gray-400 hover:border-aura-purple/40 hover:text-white"
                } disabled:opacity-50`}
              >
                {busyId === id ? "…" : unlimited ? "∞ Вкл" : "Выкл"}
              </button>,
              new Date(String(u.created_at)).toLocaleDateString("ru-RU"),
              <AdminBtn key="d" variant="danger" onClick={() => deleteUser(id)}>
                Удалить
              </AdminBtn>,
            ];
          })}
        />
      ) : (
        <AdminTable
          headers={["Имя", "Пол", "ДР", "Знак", "Создан"]}
          rows={items.map((u) => [
            String(u.name),
            u.gender === "male" ? "М" : "Ж",
            String(u.birth_date),
            String(u.zodiac),
            new Date(String(u.created_at)).toLocaleDateString("ru-RU"),
          ])}
        />
      )}
    </AdminShell>
  );
}
