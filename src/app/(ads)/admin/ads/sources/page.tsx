"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";

type Snap = {
  fetchedAt: string;
  ok: boolean;
  error: string | null;
  payload: Record<string, unknown>;
};

type SourcesResponse = {
  needsMigration?: boolean;
  error?: string;
  snapshots: Record<string, Snap>;
  recentWebmaster: { query: string; clicks: number; shows: number; position: number | null }[];
  recentGoals: { date: string; goal_id: number; goal_name: string | null; reaches: number }[];
};

function ago(iso?: string) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ч назад`;
  return new Date(iso).toLocaleString("ru-RU");
}

export default function AdsSourcesPage() {
  const [data, setData] = useState<SourcesResponse | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/ads/admin/sources")
      .then(async (r) => {
        if (r.status === 404) {
          setDisabled(true);
          return;
        }
        if (!r.ok) return;
        setData(await r.json());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ads/admin/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(d.error ?? "Ошибка обновления");
      } else {
        setNotice("Снимки обновлены из Direct / Метрики / Вебмастера");
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  if (disabled) return <AdsDisabled />;

  const direct = data?.snapshots?.direct;
  const metrika = data?.snapshots?.metrika;
  const webmaster = data?.snapshots?.webmaster;
  const health = data?.snapshots?.health;
  const dPayload = (direct?.payload || {}) as {
    balanceRub?: number | null;
    units?: string | null;
    login?: string | null;
    sandbox?: boolean;
    campaigns?: { id: number; name: string; state: string; status: string; dailyBudgetRub: number | null }[];
  };
  const mPayload = (metrika?.payload || {}) as {
    counterId?: string | null;
    traffic7d?: { visits: number; users: number; pageviews: number } | null;
    traffic30d?: { visits: number; users: number } | null;
    mappedGoals?: { env: string; id: number | null; name: string | null; reaches7d: number | null }[];
    offlineUploadingsOk?: boolean | null;
  };
  const hPayload = (health?.payload || {}) as {
    moneyBlocker?: string | null;
    flags?: { enabled?: boolean; observe?: boolean; rulesMode?: string };
    tokens?: Record<string, boolean>;
  };

  return (
    <AdminShell>
      <AdminTitle
        title="Источники"
        subtitle="Direct · Метрика · Вебмастер — без кабинетов Яндекса. Работает при балансе 0 ₽"
      />
      <AdsAdminNav />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AdminBtn onClick={() => void refresh()} disabled={busy}>
          {busy ? "Обновляю…" : "Обновить сейчас"}
        </AdminBtn>
        {notice ? <span className="text-xs text-aura-gold">{notice}</span> : null}
        {data?.needsMigration ? (
          <span className="text-xs text-amber-400">Нужна миграция 085 (npm run migrate)</span>
        ) : null}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Баланс Директа"
          value={
            dPayload.balanceRub != null ? `${Math.round(dPayload.balanceRub)} ₽` : "н/д"
          }
          accent={dPayload.balanceRub === 0 ? "text-amber-400" : "text-aura-gold"}
        />
        <StatCard
          label="Визиты Метрики 7д"
          value={mPayload.traffic7d?.visits ?? "—"}
        />
        <StatCard
          label="Запросы Вебмастера"
          value={data?.recentWebmaster?.length ?? "—"}
        />
        <StatCard
          label="Блокер трат"
          value={
            hPayload.moneyBlocker === "direct_balance_zero"
              ? "баланс 0"
              : hPayload.moneyBlocker === "direct_balance_unknown"
                ? "баланс ?"
                : "нет"
          }
          accent="text-amber-400"
        />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <div className="glass-panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Директ</h2>
            <span className={`text-[10px] ${direct?.ok ? "text-aura-emerald" : "text-red-400"}`}>
              {direct?.ok ? "ok" : "err"} · {ago(direct?.fetchedAt)}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            login {dPayload.login || "—"}
            {dPayload.sandbox ? " · sandbox" : " · production"}
          </p>
          <p className="mt-1 text-xs text-gray-500">Units: {dPayload.units || "—"}</p>
          {direct?.error ? <p className="mt-2 text-xs text-red-400">{direct.error}</p> : null}
          <div className="mt-3 max-h-48 overflow-auto">
            <AdminTable
              headers={["ID", "Кампания", "State", "Status"]}
              rows={(dPayload.campaigns || []).map((c) => [
                String(c.id),
                c.name,
                c.state,
                c.status,
              ])}
            />
          </div>
        </div>

        <div className="glass-panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Метрика</h2>
            <span className={`text-[10px] ${metrika?.ok ? "text-aura-emerald" : "text-red-400"}`}>
              {metrika?.ok ? "ok" : "err"} · {ago(metrika?.fetchedAt)}
            </span>
          </div>
          <p className="text-xs text-gray-500">counter {mPayload.counterId || "—"}</p>
          <p className="mt-1 text-xs text-gray-400">
            7д: {mPayload.traffic7d?.visits ?? "—"} визитов / {mPayload.traffic7d?.users ?? "—"}{" "}
            польз.
          </p>
          <p className="text-xs text-gray-400">
            30д: {mPayload.traffic30d?.visits ?? "—"} визитов · offline upload:{" "}
            {mPayload.offlineUploadingsOk == null
              ? "—"
              : mPayload.offlineUploadingsOk
                ? "ok"
                : "fail"}
          </p>
          {metrika?.error ? <p className="mt-2 text-xs text-red-400">{metrika.error}</p> : null}
          <div className="mt-3">
            <AdminTable
              headers={["Цель", "ID", "Достижения 7д"]}
              rows={(mPayload.mappedGoals || []).map((g) => [
                g.name || g.env,
                g.id != null ? String(g.id) : "—",
                g.reaches7d != null ? String(g.reaches7d) : "—",
              ])}
            />
          </div>
        </div>

        <div className="glass-panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Вебмастер</h2>
            <span
              className={`text-[10px] ${webmaster?.ok ? "text-aura-emerald" : "text-red-400"}`}
            >
              {webmaster?.ok ? "ok" : "err"} · {ago(webmaster?.fetchedAt)}
            </span>
          </div>
          {webmaster?.error ? (
            <p className="mt-2 text-xs text-red-400">{webmaster.error}</p>
          ) : null}
          <div className="mt-3 max-h-64 overflow-auto">
            <AdminTable
              headers={["Запрос", "Клики", "Показы", "Поз."]}
              rows={(data?.recentWebmaster || []).map((q) => [
                q.query,
                String(q.clicks),
                String(q.shows),
                q.position != null ? q.position.toFixed(1) : "—",
              ])}
            />
          </div>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-white">Токены и флаги</h2>
      <div className="glass-panel mb-8 grid gap-2 p-4 text-xs text-gray-400 sm:grid-cols-2">
        <div>
          enabled: {String(hPayload.flags?.enabled)} · observe:{" "}
          {String(hPayload.flags?.observe)} · rules: {hPayload.flags?.rulesMode}
        </div>
        <div>
          {Object.entries(hPayload.tokens || {}).map(([k, v]) => (
            <span key={k} className="mr-3">
              {k.replace(/_TOKEN|_GOAL_REGISTRATION/, "")}:{v ? "✓" : "✗"}
            </span>
          ))}
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-white">Цели Метрики (кэш)</h2>
      <AdminTable
        headers={["Дата", "Goal", "ID", "Reaches"]}
        rows={(data?.recentGoals || []).map((g) => [
          g.date,
          g.goal_name || "—",
          String(g.goal_id),
          String(g.reaches),
        ])}
      />
    </AdminShell>
  );
}
