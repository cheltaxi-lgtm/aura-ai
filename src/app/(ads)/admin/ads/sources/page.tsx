"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";

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
  recentWebmaster: {
    query: string;
    clicks: number;
    shows: number;
    position: number | null;
  }[];
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

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  // Metrika bounceRate is already 0–100; CTR we store 0–1
  const v = n > 1 ? n : n * 100;
  return `${v.toFixed(digits)}%`;
}

function fmtDur(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}м ${r}с` : `${r}с`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("ru-RU");
}

export default function AdsSourcesPage() {
  const [data, setData] = useState<SourcesResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/ads/admin/sources")
      .then(async (r) => {
        if (r.status === 403) {
          setLoadError("Нужна роль admin");
          return;
        }
        if (!r.ok) {
          setLoadError(`sources HTTP ${r.status}`);
          return;
        }
        setData(await r.json());
      })
      .catch(() => setLoadError("Не удалось загрузить источники"));
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
        const parts = [
          d.result?.metrika?.ok ? "Метрика ✓" : `Метрика ✗ ${d.result?.metrika?.error || ""}`,
          d.result?.webmaster?.ok
            ? "Вебмастер ✓"
            : `Вебмастер ✗ ${d.result?.webmaster?.error || ""}`,
          d.result?.direct?.ok ? "Директ ✓" : `Директ ✗ ${d.result?.direct?.error || ""}`,
        ];
        setNotice(parts.join(" · "));
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  const direct = data?.snapshots?.direct;
  const metrika = data?.snapshots?.metrika;
  const webmaster = data?.snapshots?.webmaster;
  const m = (metrika?.payload || {}) as {
    counterId?: string | null;
    range7d?: { from: string; to: string };
    range30d?: { from: string; to: string };
    traffic7d?: {
      visits: number;
      users: number;
      pageviews: number;
      bounceRate: number | null;
      avgDurationSec: number | null;
    } | null;
    traffic30d?: {
      visits: number;
      users: number;
      pageviews: number;
      bounceRate: number | null;
      avgDurationSec: number | null;
    } | null;
    daily?: { date: string; visits: number; users: number }[];
    bySource?: { source: string; visits: number; users: number; bounceRate: number | null }[];
    byDevice?: { device: string; visits: number; users: number }[];
    topLandings?: { path: string; visits: number; bounceRate: number | null }[];
    topSearchPhrases?: { phrase: string; visits: number }[];
    mappedGoals?: {
      label: string;
      env: string;
      id: number | null;
      name: string | null;
      reaches7d: number | null;
      reaches30d: number | null;
      cr7d: number | null;
    }[];
  };
  const w = (webmaster?.payload || {}) as {
    hostDisplay?: string | null;
    hostId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    totals?: {
      clicks: number;
      shows: number;
      avgPosition: number | null;
      ctr: number | null;
      queryCount: number;
    };
    queries?: {
      query: string;
      clicks: number;
      shows: number;
      position: number | null;
      ctr: number | null;
    }[];
  };
  const dPayload = (direct?.payload || {}) as {
    balanceRub?: number | null;
    login?: string | null;
    sandbox?: boolean;
  };

  const webmasterRows =
    (w.queries && w.queries.length > 0
      ? w.queries
      : (data?.recentWebmaster || []).map((q) => ({
          ...q,
          ctr: q.shows > 0 ? q.clicks / q.shows : null,
        }))
    ).slice(0, 40);

  const maxDaily = Math.max(1, ...(m.daily || []).map((d) => d.visits));

  return (
    <AdminShell>
      <AdminTitle
        title="Источники"
        subtitle="Живая статистика сайта: Метрика + Вебмастер. Обновляется по кнопке или cron."
      />
      <AdsAdminNav />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AdminBtn onClick={() => void refresh()} disabled={busy}>
          {busy ? "Тяну из Яндекса…" : "Обновить статистику"}
        </AdminBtn>
        {notice ? <span className="text-xs text-aura-gold">{notice}</span> : null}
        {loadError ? <span className="text-xs text-red-400">{loadError}</span> : null}
        {data?.needsMigration ? (
          <span className="text-xs text-amber-400">Нужна миграция 085</span>
        ) : null}
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Визиты 7д" value={fmtNum(m.traffic7d?.visits)} accent="text-aura-gold" />
        <StatCard label="Пользователи 7д" value={fmtNum(m.traffic7d?.users)} />
        <StatCard label="Отказы 7д" value={fmtPct(m.traffic7d?.bounceRate)} />
        <StatCard label="Ср. время" value={fmtDur(m.traffic7d?.avgDurationSec)} />
        <StatCard
          label="Клики поиска 28д"
          value={fmtNum(w.totals?.clicks)}
          accent="text-aura-emerald"
        />
        <StatCard label="Показы поиска 28д" value={fmtNum(w.totals?.shows)} />
      </div>

      <div className="mb-2 flex flex-wrap gap-4 text-[11px] text-gray-500">
        <span>
          Метрика: {metrika?.ok ? "ok" : "err"} · {ago(metrika?.fetchedAt)}
          {m.range7d ? ` · ${m.range7d.from}…${m.range7d.to}` : ""}
        </span>
        <span>
          Вебмастер: {webmaster?.ok ? "ok" : "err"} · {ago(webmaster?.fetchedAt)}
          {w.dateFrom ? ` · ${w.dateFrom}…${w.dateTo}` : ""}
        </span>
        <span>
          Директ: {direct?.ok ? "ok" : "err"}
          {dPayload.balanceRub != null ? ` · баланс ${Math.round(dPayload.balanceRub)} ₽` : ""}
          {direct?.error ? ` · ${direct.error}` : ""}
        </span>
      </div>
      {metrika?.error ? <p className="mb-2 text-xs text-red-400">{metrika.error}</p> : null}
      {webmaster?.error ? <p className="mb-2 text-xs text-red-400">{webmaster.error}</p> : null}

      {/* Daily spark bars */}
      <div className="glass-panel mb-6 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Визиты по дням (14д)</h2>
        {(m.daily || []).length === 0 ? (
          <p className="text-sm text-gray-600">Нет ряда — нажмите «Обновить статистику»</p>
        ) : (
          <div className="flex h-28 items-end gap-1">
            {(m.daily || []).map((d) => (
              <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[9px] text-gray-500">{d.visits}</span>
                <div
                  className="w-full rounded-t bg-aura-gold/70"
                  style={{ height: `${Math.max(4, (d.visits / maxDaily) * 100)}%` }}
                  title={`${d.date}: ${d.visits} визитов / ${d.users} польз.`}
                />
                <span className="truncate text-[9px] text-gray-600">
                  {d.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="glass-panel p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Источники трафика (7д)</h2>
          <AdminTable
            headers={["Источник", "Визиты", "Польз.", "Отказы"]}
            rows={(m.bySource || []).map((s) => [
              s.source,
              fmtNum(s.visits),
              fmtNum(s.users),
              fmtPct(s.bounceRate),
            ])}
          />
        </div>
        <div className="glass-panel p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Устройства (7д)</h2>
          <AdminTable
            headers={["Устройство", "Визиты", "Польз."]}
            rows={(m.byDevice || []).map((d) => [
              d.device,
              fmtNum(d.visits),
              fmtNum(d.users),
            ])}
          />
          <h2 className="mb-3 mt-6 text-sm font-semibold text-white">Цели воронки</h2>
          <AdminTable
            headers={["Цель", "7д", "30д", "CR 7д"]}
            rows={(m.mappedGoals || []).map((g) => [
              g.name || g.label,
              g.id == null ? "нет ID" : fmtNum(g.reaches7d),
              g.id == null ? "—" : fmtNum(g.reaches30d),
              g.cr7d == null ? "—" : fmtPct(g.cr7d),
            ])}
          />
        </div>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="glass-panel p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Топ посадочных (7д)</h2>
          <AdminTable
            headers={["Путь", "Визиты", "Отказы"]}
            rows={(m.topLandings || []).map((l) => [
              l.path,
              fmtNum(l.visits),
              fmtPct(l.bounceRate),
            ])}
          />
        </div>
        <div className="glass-panel p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Поисковые фразы Метрики (30д)</h2>
          <AdminTable
            headers={["Фраза", "Визиты"]}
            rows={(m.topSearchPhrases || []).map((p) => [p.phrase, fmtNum(p.visits)])}
          />
          {(m.topSearchPhrases || []).length === 0 ? (
            <p className="mt-2 text-xs text-gray-600">
              Пусто — мало органики с передачей фразы или not provided.
            </p>
          ) : null}
        </div>
      </div>

      <div className="glass-panel mb-8 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">
            Яндекс.Вебмастер · запросы ({w.hostDisplay || w.hostId || "—"})
          </h2>
          <span className="text-xs text-gray-500">
            клики {fmtNum(w.totals?.clicks)} · показы {fmtNum(w.totals?.shows)} · CTR{" "}
            {fmtPct(w.totals?.ctr)} · ср.поз.{" "}
            {w.totals?.avgPosition != null ? w.totals.avgPosition.toFixed(1) : "—"}
          </span>
        </div>
        <AdminTable
          headers={["Запрос", "Клики", "Показы", "CTR", "Поз."]}
          rows={webmasterRows.map((q) => [
            q.query,
            fmtNum(q.clicks),
            fmtNum(q.shows),
            fmtPct(q.ctr),
            q.position != null ? q.position.toFixed(1) : "—",
          ])}
        />
      </div>

      <p className="text-[11px] text-gray-600">
        counter {m.counterId || "—"} · 30д: {fmtNum(m.traffic30d?.visits)} визитов /{" "}
        {fmtNum(m.traffic30d?.users)} польз. · отказы {fmtPct(m.traffic30d?.bounceRate)}
      </p>
    </AdminShell>
  );
}
