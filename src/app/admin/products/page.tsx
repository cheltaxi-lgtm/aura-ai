"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, StatCard } from "@/components/admin/AdminShell";
import type { ProductSectionStats } from "@/lib/admin-product-stats";

type Payload = {
  sections: ProductSectionStats[];
  actions: { action: string; label: string; spend30d: number; runes30d: number }[];
};

export default function AdminProductsPage() {
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    fetch("/api/admin/product-stats")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ sections: [], actions: [] }));
  }, []);

  const sections = data?.sections ?? [];
  const total30 = sections.reduce((sum, s) => sum + s.runes30d, 0);
  const spend30 = sections.reduce((sum, s) => sum + s.spend30d, 0);

  return (
    <AdminShell>
      <AdminTitle
        title="Разделы"
        subtitle="Списания рун и очередь отчётов по продуктам, которые реально используют"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Списаний за 30 дней" value={data ? spend30 : "—"} />
        <StatCard label="Рун за 30 дней" value={data ? total30 : "—"} accent="text-aura-gold" />
        <StatCard label="Активных разделов" value={data ? sections.length : "—"} />
        <StatCard
          label="Очередь (pending)"
          value={data ? sections.reduce((sum, s) => sum + s.jobsPending, 0) : "—"}
          accent="text-amber-300"
        />
      </div>

      <div className="mt-8 space-y-4">
        {data && sections.length === 0 ? (
          <p className="text-sm text-white/50">Пока нет списаний по разделам.</p>
        ) : null}
        {sections.map((section) => (
          <article key={section.id} className="glass-panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg text-white">{section.label}</h2>
              <p className="text-sm text-white/45">
                30 дней: {section.spend30d} списаний · {section.runes30d} ᚢ
              </p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-white/40">7 дней</dt>
                <dd className="text-white/85">
                  {section.spend7d} · {section.runes7d} ᚢ
                </dd>
              </div>
              <div>
                <dt className="text-white/40">Всего</dt>
                <dd className="text-white/85">
                  {section.spendAll} · {section.runesAll} ᚢ
                </dd>
              </div>
              <div>
                <dt className="text-white/40">Возвраты 30д</dt>
                <dd className="text-white/85">{section.refunds30d}</dd>
              </div>
              <div>
                <dt className="text-white/40">Очередь / ошибки 30д</dt>
                <dd className="text-white/85">
                  {section.jobsPending} / {section.jobsFailed30d}
                </dd>
              </div>
            </dl>
            {section.extras.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm text-white/55">
                {section.extras.map((extra) => (
                  <li key={extra.label}>
                    {extra.label}: <span className="text-white/80">{extra.value}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>

      {data?.actions && data.actions.length > 0 ? (
        <div className="mt-8 glass-panel p-5">
          <h2 className="font-display mb-4 text-lg text-white">Списания по действию · 30 дней</h2>
          <div className="space-y-2">
            {data.actions.map((row) => (
              <div key={row.action} className="flex items-center justify-between text-sm">
                <span className="text-white/60">{row.label}</span>
                <span className="text-white/85">
                  {row.spend30d} · {row.runes30d} ᚢ
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
