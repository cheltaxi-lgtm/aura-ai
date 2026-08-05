"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn } from "@/components/admin/AdminShell";

export default function AdminInfluencersPage() {
  const [tab, setTab] = useState<"influencers" | "bloggers">("influencers");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);

  const load = () => {
    fetch(`/api/admin/influencers?type=${tab}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
  };
  useEffect(load, [tab]);

  const toggleBlogger = async (id: string, is_active: boolean) => {
    const { adminFetch } = await import("@/lib/admin-fetch");
    await adminFetch("/api/admin/influencers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "blogger", id, is_active: !is_active }),
    });
    load();
  };

  return (
    <AdminShell>
      <AdminTitle title="Блогеры и инфлюенсеры" subtitle="B2B, реферальные ссылки, white-label" />
      <div className="mb-4 flex gap-2">
        {(["influencers", "bloggers"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm ${tab === t ? "bg-aura-gold/20 text-aura-champagne" : "text-gray-500"}`}
          >
            {t === "influencers" ? "Инфлюенсеры" : "White-label"}
          </button>
        ))}
      </div>

      {tab === "influencers" ? (
        <AdminTable
          headers={["Имя", "Token", "Telegram", "Баланс", "Клики", "Ref URL"]}
          rows={items.map((i) => [
            String(i.name),
            <code key="t" className="text-xs">{String(i.token)}</code>,
            String(i.telegram_link ?? "—"),
            `${parseFloat(String(i.balance)).toFixed(2)} ₽`,
            String(i.clicks ?? "0"),
            <code key="u" className="text-xs text-aura-gold">/?ref={String(i.token)}</code>,
          ])}
        />
      ) : (
        <AdminTable
          headers={["Slug", "Имя", "Сплит", "Статус", ""]}
          rows={items.map((b) => [
            String(b.slug),
            String(b.display_name),
            `${b.split_percent}%`,
            b.is_active ? "Активен" : "Выкл",
            <AdminBtn key="t" onClick={() => toggleBlogger(String(b.id), Boolean(b.is_active))}>
              {b.is_active ? "Выкл" : "Вкл"}
            </AdminBtn>,
          ])}
        />
      )}
    </AdminShell>
  );
}
