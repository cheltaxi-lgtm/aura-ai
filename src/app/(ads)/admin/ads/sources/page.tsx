"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell, {
  AdminTitle,
  AdminTable,
  AdminBtn,
  StatCard,
} from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import { HorizontalBars, TrafficLineChart } from "@/modules/ads/admin/SourcesCharts";
import WordstatPanel from "@/modules/ads/admin/WordstatPanel";
import type { PeriodDays } from "@/modules/ads/sources/metrika";

type Analytics = {
  ok: boolean;
  days: PeriodDays;
  fetchedAt: string;
  error?: string | null;
  metrikaError?: string | null;
  webmasterError?: string | null;
  metrika: {
    counterId: string | null;
    range: { from: string; to: string };
    traffic: {
      visits: number;
      users: number;
      pageviews: number;
      bounceRate: number | null;
      avgDurationSec: number | null;
    } | null;
    trafficOrganic: {
      visits: number;
      users: number;
      bounceRate: number | null;
    } | null;
    daily: { date: string; visits: number; users: number; organicVisits: number }[];
    bySource: { source: string; visits: number; users: number; bounceRate: number | null }[];
    byDevice: { device: string; visits: number; users: number }[];
    bySearchEngine: {
      engine: string;
      visits: number;
      users: number;
      bounceRate: number | null;
    }[];
    topLandings: { path: string; visits: number; bounceRate: number | null }[];
    searchPhrases: {
      phrase: string;
      engine: string;
      visits: number;
      users: number;
      bounceRate: number | null;
    }[];
    mappedGoals: {
      label: string;
      name: string | null;
      id: number | null;
      reaches: number | null;
      cr: number | null;
    }[];
    partialErrors?: string[];
  } | null;
  webmaster: {
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
  } | null;
};

const PERIODS: { days: PeriodDays; label: string }[] = [
  { days: 7, label: "7 дней" },
  { days: 14, label: "14 дней" },
  { days: 30, label: "30 дней" },
  { days: 90, label: "90 дней" },
];

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
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
  const [days, setDays] = useState<PeriodDays>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (period: PeriodDays) => {
    setBusy(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/ads/admin/sources/analytics?days=${period}`);
      if (r.status === 403) {
        setLoadError("Нужна роль admin");
        return;
      }
      const json = (await r.json()) as Analytics;
      setData(json);
      const parts = [json.metrikaError, json.webmasterError, !json.metrika && !json.webmaster ? json.error : null]
        .filter(Boolean)
        .join(" · ");
      setLoadError(parts || null);
    } catch {
      setLoadError("Не удалось загрузить аналитику");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const m = data?.metrika;
  const w = data?.webmaster;
  const t = m?.traffic;
  const org = m?.trafficOrganic;
  const organicShare =
    t && t.visits > 0 && org ? org.visits / t.visits : null;

  return (
    <AdminShell>
      <AdminTitle
        title="Источники"
        subtitle="Метрика · Вебмастер · Wordstat по тематике Zovus"
      />
      <AdsAdminNav />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-white/10 bg-black/30 p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              disabled={busy}
              onClick={() => setDays(p.days)}
              className={`rounded-lg px-3 py-1.5 text-xs transition ${
                days === p.days
                  ? "bg-aura-gold/20 text-aura-gold"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <AdminBtn onClick={() => void load(days)} disabled={busy}>
          {busy ? "Загрузка…" : "Обновить Метрику"}
        </AdminBtn>
        {data?.fetchedAt ? (
          <span className="text-[11px] text-gray-500">
            {m?.range.from} — {m?.range.to}
          </span>
        ) : null}
        {loadError ? <span className="text-xs text-red-400">{loadError}</span> : null}
      </div>

      {data?.metrika?.partialErrors?.length ? (
        <p className="mb-4 text-xs text-amber-400">
          Метрика частично: {data.metrika.partialErrors.join(" · ")}
        </p>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Визиты" value={fmtNum(t?.visits)} accent="text-aura-gold" />
        <StatCard label="Пользователи" value={fmtNum(t?.users)} />
        <StatCard label="Из поиска" value={fmtNum(org?.visits)} accent="text-aura-emerald" />
        <StatCard label="Доля поиска" value={fmtPct(organicShare)} />
        <StatCard label="Отказы" value={fmtPct(t?.bounceRate)} />
        <StatCard label="Ср. время" value={fmtDur(t?.avgDurationSec)} />
      </div>

      <div className="glass-panel mb-6 p-4">
        <h2 className="mb-2 text-sm font-semibold text-white">
          Динамика визитов · {days}д
        </h2>
        <TrafficLineChart daily={m?.daily || []} />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="glass-panel p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Поисковые фразы (переходы из ПС)
          </h2>
          <p className="mb-3 text-[11px] text-gray-500">
            Только organic: фразы, по которым пришли из Яндекса / Google и др. поисковиков.
          </p>
          <AdminTable
            headers={["Фраза", "ПС", "Визиты", "Польз.", "Отказы"]}
            rows={(m?.searchPhrases || []).map((p) => [
              p.phrase,
              p.engine,
              fmtNum(p.visits),
              fmtNum(p.users),
              fmtPct(p.bounceRate),
            ])}
          />
          {(m?.searchPhrases || []).length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">
              За период нет атрибутированных фраз (мало органики или «not provided»).
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="glass-panel p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Поисковые системы</h2>
            <HorizontalBars
              items={(m?.bySearchEngine || []).map((e) => ({
                label: e.engine,
                value: e.visits,
                hint: fmtPct(e.bounceRate),
              }))}
            />
          </div>
          <div className="glass-panel p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Источники трафика</h2>
            <HorizontalBars
              items={(m?.bySource || []).map((s) => ({
                label: s.source,
                value: s.visits,
                hint: fmtPct(s.bounceRate),
              }))}
            />
          </div>
        </div>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="glass-panel p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Посадочные</h2>
          <AdminTable
            headers={["Путь", "Визиты", "Отказы"]}
            rows={(m?.topLandings || []).map((l) => [
              l.path,
              fmtNum(l.visits),
              fmtPct(l.bounceRate),
            ])}
          />
        </div>
        <div className="glass-panel p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Устройства · цели</h2>
          <AdminTable
            headers={["Устройство", "Визиты", "Польз."]}
            rows={(m?.byDevice || []).map((d) => [
              d.device,
              fmtNum(d.visits),
              fmtNum(d.users),
            ])}
          />
          <div className="mt-4">
            <AdminTable
              headers={["Цель", "Достижения", "CR"]}
              rows={(m?.mappedGoals || []).map((g) => [
                g.name || g.label,
                g.id == null ? "нет ID" : fmtNum(g.reaches),
                fmtPct(g.cr),
              ])}
            />
          </div>
        </div>
      </div>

      <div className="glass-panel mb-6 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">
            Вебмастер · запросы в выдаче ({w?.hostDisplay || w?.hostId || "—"})
          </h2>
          <span className="text-xs text-gray-500">
            {w?.dateFrom} — {w?.dateTo} · клики {fmtNum(w?.totals?.clicks)} · показы{" "}
            {fmtNum(w?.totals?.shows)} · CTR {fmtPct(w?.totals?.ctr)} · поз.{" "}
            {w?.totals?.avgPosition != null ? w.totals.avgPosition.toFixed(1) : "—"}
          </span>
        </div>
        <p className="mb-3 text-[11px] text-gray-500">
          Это показы/клики в поиске Яндекса (не обязательно совпадает с визитами Метрики).
        </p>
        {data?.webmasterError ? (
          <p className="mb-3 text-sm text-red-400">{data.webmasterError}</p>
        ) : null}
        <AdminTable
          headers={["Запрос", "Клики", "Показы", "CTR", "Поз."]}
          rows={(w?.queries || []).slice(0, 40).map((q) => [
            q.query,
            fmtNum(q.clicks),
            fmtNum(q.shows),
            fmtPct(q.ctr),
            q.position != null ? q.position.toFixed(1) : "—",
          ])}
        />
      </div>

      <WordstatPanel />

      <p className="text-[11px] text-gray-600">
        counter {m?.counterId || "—"} · Метрика за период · Вебмастер ~28д · Wordstat история 90д
      </p>
    </AdminShell>
  );
}
