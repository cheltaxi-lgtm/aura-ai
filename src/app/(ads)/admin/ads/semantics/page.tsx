"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";

type Candidate = {
  id: string;
  phrase: string;
  source: string;
  freq_exact: number | null;
  landing_path: string | null;
  status: string;
};

type Negative = {
  id: string;
  phrase: string;
  reason: string | null;
  auto: boolean;
  scope: string;
};

type Query = {
  date: string;
  campaign_id: number;
  adgroup_id: number;
  query: string;
  clicks: number;
  cost_rub: string;
  decision: string | null;
};

export default function AdsSemanticsPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [negatives, setNegatives] = useState<Negative[]>([]);
  const [queries, setQueries] = useState<Query[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/ads/admin/semantics")
      .then(async (r) => {
        if (r.status === 404) {
          setDisabled(true);
          return;
        }
        if (!r.ok) return;
        const d = await r.json();
        setCandidates(d.candidates ?? []);
        setNegatives(d.negatives ?? []);
        setQueries(d.searchQueries ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const bulk = async (action: "approve_candidates" | "reject_candidates") => {
    if (!selected.size) return;
    setBusy(true);
    try {
      await fetch("/api/ads/admin/semantics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: [...selected] }),
      });
      setSelected(new Set());
      load();
    } finally {
      setBusy(false);
    }
  };

  const undo = async (q: Query) => {
    setBusy(true);
    try {
      await fetch("/api/ads/admin/semantics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "undo_query",
          date: q.date,
          campaignId: q.campaign_id,
          adgroupId: q.adgroup_id,
          query: q.query,
        }),
      });
      load();
    } finally {
      setBusy(false);
    }
  };

  if (disabled) return <AdsDisabled />;

  const pending = candidates.filter((c) => c.status === "pending");

  return (
    <AdminShell>
      <AdminTitle title="Семантика" subtitle="Кандидаты, минус-слова, поисковые запросы" />
      <AdsAdminNav />

      <div className="mb-4 flex flex-wrap gap-2">
        <AdminBtn disabled={busy || !selected.size} onClick={() => void bulk("approve_candidates")}>
          Approve выбранные
        </AdminBtn>
        <AdminBtn
          variant="danger"
          disabled={busy || !selected.size}
          onClick={() => void bulk("reject_candidates")}
        >
          Reject выбранные
        </AdminBtn>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-white">Кандидаты</h2>
      <AdminTable
        headers={["", "Фраза", "Источник", "Freq", "Landing", "Статус"]}
        rows={pending.map((c) => [
          <input
            key="c"
            type="checkbox"
            checked={selected.has(c.id)}
            onChange={() => toggle(c.id)}
            className="accent-aura-gold"
          />,
          c.phrase,
          c.source,
          c.freq_exact ?? "—",
          c.landing_path ?? "—",
          c.status,
        ])}
      />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-white">Минус-слова</h2>
      <AdminTable
        headers={["Фраза", "Scope", "Причина", "Auto"]}
        rows={negatives.map((n) => [
          n.phrase,
          n.scope,
          n.reason ?? "—",
          n.auto ? "auto" : "manual",
        ])}
      />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-white">Поисковые запросы (вчера+)</h2>
      <AdminTable
        headers={["Дата", "Запрос", "Клики", "Расход", "Решение", ""]}
        rows={queries.map((q) => [
          String(q.date).slice(0, 10),
          q.query,
          String(q.clicks),
          `${q.cost_rub} ₽`,
          q.decision ?? "—",
          q.decision ? (
            <AdminBtn key="u" disabled={busy} onClick={() => void undo(q)}>
              Отменить
            </AdminBtn>
          ) : (
            "—"
          ),
        ])}
      />
    </AdminShell>
  );
}
