"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn } from "@/components/admin/AdminShell";

export default function AdminSessionsPage() {
  const [tab, setTab] = useState<"sessions" | "messages">("sessions");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState("");

  const load = () => {
    const q = tab === "messages" && search ? `&q=${encodeURIComponent(search)}` : "";
    fetch(`/api/admin/sessions?type=${tab}${q}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
  };
  // Search is intentionally submitted by the "Найти" button, not on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [tab]);

  const deleteMsg = async (id: string) => {
    if (!confirm("Удалить сообщение?")) return;
    await fetch("/api/admin/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  return (
    <AdminShell>
      <AdminTitle title="Сессии и чат" subtitle="Анонимные сессии и история сообщений" />
      <div className="mb-4 flex flex-wrap gap-2">
        {(["sessions", "messages"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm ${tab === t ? "bg-aura-gold/20 text-aura-champagne" : "text-gray-500"}`}
          >
            {t === "sessions" ? "Сессии" : "Сообщения"}
          </button>
        ))}
        {tab === "messages" && (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <button onClick={load} className="btn-primary px-4 py-2 text-xs">Найти</button>
          </>
        )}
      </div>

      {tab === "sessions" ? (
        <AdminTable
          headers={["ID", "Referrer", "Вопросов", "Paid", "Unlock", "Сообщений", "Создана"]}
          rows={items.map((s) => [
            <code key="i" className="text-xs">{String(s.id).slice(0, 8)}…</code>,
            String(s.referrer_slug ?? "—"),
            String(s.free_questions_used),
            s.paid_until ? new Date(String(s.paid_until)).toLocaleDateString("ru-RU") : "—",
            s.has_single_unlock ? "✓" : "—",
            String(s.messages_count ?? "0"),
            new Date(String(s.created_at)).toLocaleString("ru-RU"),
          ])}
        />
      ) : (
        <AdminTable
          headers={["Мастер", "Роль", "Текст", "Дата", ""]}
          rows={items.map((m) => [
            String(m.character_id),
            m.role === "user" ? "Клиент" : "Мастер",
            <span key="c" className="line-clamp-2 max-w-md text-xs">{String(m.content)}</span>,
            new Date(String(m.created_at)).toLocaleString("ru-RU"),
            m.role === "assistant" ? (
              <AdminBtn key="d" variant="danger" onClick={() => deleteMsg(String(m.id))}>Удалить</AdminBtn>
            ) : null,
          ])}
        />
      )}
    </AdminShell>
  );
}
