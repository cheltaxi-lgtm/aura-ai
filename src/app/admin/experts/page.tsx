"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn } from "@/components/admin/AdminShell";

export default function AdminExpertsPage() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);

  const load = () => fetch("/api/admin/experts").then((r) => r.json()).then((d) => setItems(d.items ?? []));
  useEffect(() => { load(); }, []);

  const toggle = async (id: string, is_active: boolean) => {
    await fetch("/api/admin/experts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !is_active }),
    });
    load();
  };

  return (
    <AdminShell>
      <AdminTitle title="Эзотерики" subtitle="Кабинеты и white-label мастера" />
      <AdminTable
        headers={["Email", "Имя", "Slug", "Сплит %", "База знаний", "Статус", ""]}
        rows={items.map((e) => [
          String(e.email),
          String(e.name),
          <code key="s" className="text-aura-neon">{String(e.slug)}</code>,
          String(e.split_percent),
          String(e.knowledge_count ?? "0"),
          e.is_active ? <span className="text-aura-emerald">Активен</span> : <span className="text-red-400">Выкл</span>,
          <AdminBtn key="t" onClick={() => toggle(String(e.id), Boolean(e.is_active))}>
            {e.is_active ? "Отключить" : "Включить"}
          </AdminBtn>,
        ])}
      />
    </AdminShell>
  );
}
