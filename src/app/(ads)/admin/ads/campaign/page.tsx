"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";
import AdsErrorBanner from "@/modules/ads/admin/AdsErrorBanner";
import DirectStatusCard from "@/modules/ads/admin/DirectStatusCard";

type Campaign = {
  id: string;
  name: string | null;
  status: string | null;
  moderationStatus: string | null;
  strategyMode: string | null;
  dailyBudgetRub: number | null;
  spent: number;
  clicks: number;
  registrations: number;
  cpaRegistration: number | null;
};

export default function AdsCampaignPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/ads/admin/campaign")
      .then(async (r) => {
        if (r.status === 404) {
          setDisabled(true);
          return;
        }
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string };
          setError(d.error || `HTTP ${r.status}`);
          return;
        }
        const d = await r.json();
        setCampaigns(d.campaigns ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "network"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action: "pause" | "resume", id?: string) => {
    setBusy(`${action}:${id || "all"}`);
    try {
      const { adminFetch } = await import("@/lib/admin-fetch");
      const res = await adminFetch("/api/ads/admin/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: id ? [id] : undefined }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(d.error || `HTTP ${res.status}`);
        return;
      }
      setError(null);
      load();
    } finally {
      setBusy(null);
    }
  };

  if (disabled) return <AdsDisabled />;

  const primary = campaigns[0];

  return (
    <AdminShell>
      <AdminTitle title="Кампания" subtitle="Статус, модерация, pause / resume" />
      <AdsAdminNav />
      <AdsErrorBanner error={error} />
      <DirectStatusCard />

      {primary && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Статус" value={primary.status ?? "—"} accent="text-aura-gold" />
          <StatCard label="Модерация" value={primary.moderationStatus ?? "—"} />
          <StatCard label="Стратегия" value={primary.strategyMode ?? "—"} />
          <StatCard
            label="CPA(reg), ₽"
            value={primary.cpaRegistration != null ? Math.round(primary.cpaRegistration) : "—"}
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <AdminBtn onClick={() => void act("pause")} disabled={!!busy} variant="danger">
          Пауза всех
        </AdminBtn>
        <AdminBtn onClick={() => void act("resume")} disabled={!!busy}>
          Возобновить все
        </AdminBtn>
      </div>

      <AdminTable
        headers={["ID", "Название", "Статус", "Модерация", "Расход", "CPA reg", ""]}
        rows={campaigns.map((c) => [
          c.id,
          c.name ?? "—",
          c.status ?? "—",
          c.moderationStatus ?? "—",
          `${Math.round(c.spent)} ₽`,
          c.cpaRegistration != null ? `${Math.round(c.cpaRegistration)} ₽` : "—",
          <span key="a" className="flex gap-2">
            <AdminBtn
              variant="danger"
              disabled={!!busy}
              onClick={() => void act("pause", c.id)}
            >
              Pause
            </AdminBtn>
            <AdminBtn disabled={!!busy} onClick={() => void act("resume", c.id)}>
              Resume
            </AdminBtn>
          </span>,
        ])}
      />
    </AdminShell>
  );
}
