"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn } from "@/components/admin/AdminShell";

export default function AdminAuditPage() {
  const [tab, setTab] = useState<"audit" | "knowledge">("audit");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);

  const load = () => {
    fetch(`/api/admin/audit?type=${tab}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
  };
  useEffect(load, [tab]);

  const deleteKn = async (id: string) => {
    if (!confirm("Удалить запись базы знаний?")) return;
    await fetch("/api/admin/audit", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  return (
    <AdminShell>
      <AdminTitle title="Аудит и модерация" subtitle="Журнал действий админов и база знаний" />
      <div className="mb-4 flex gap-2">
        {(["audit", "knowledge"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm ${tab === t ? "bg-aura-purple/20 text-aura-neon" : "text-gray-500"}`}
          >
            {t === "audit" ? "Журнал" : "База знаний"}
          </button>
        ))}
      </div>

      {tab === "audit" ? (
        <AdminTable
          headers={["Действие", "Сущность", "Админ", "Дата"]}
          rows={items.map((a) => [
            String(a.action),
            `${a.entity_type ?? ""} ${a.entity_id ?? ""}`.trim() || "—",
            String(a.admin_email ?? "—"),
            new Date(String(a.created_at)).toLocaleString("ru-RU"),
          ])}
        />
      ) : (
        <AdminTable
          headers={["Блогер", "Заголовок", "Контент", ""]}
          rows={items.map((k) => [
            String(k.display_name),
            String(k.title ?? "—"),
            <span key="c" className="line-clamp-2 max-w-md text-xs">{String(k.content)}</span>,
            <AdminBtn key="d" variant="danger" onClick={() => deleteKn(String(k.id))}>Удалить</AdminBtn>,
          ])}
        />
      )}
    </AdminShell>
  );
}
