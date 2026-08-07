"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import AdminShell, { AdminBtn, AdminTitle } from "@/components/admin/AdminShell";

type Metrics = {
  p50WaitMs: number | null;
  p95WaitMs: number | null;
  p50GenMs: number | null;
  p95GenMs: number | null;
  avgGenMs: number | null;
  costRub24h: number;
  retries429_24h: number;
  failed24h: number;
  needsRegeneration24h: number;
  queueLen: number;
};

type QueueRow = {
  id: string;
  kind: string;
  userId: string;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string | null;
  error: string | null;
};

function fmtMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}с`;
  return `${(ms / 60_000).toFixed(1)}м`;
}

export default function AdminAsyncJobsPage() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [statuses, setStatuses] = useState<
    { status: string; kind: string; count: number }[]
  >([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [cbOpen, setCbOpen] = useState(false);
  const [provider, setProvider] = useState<{
    ok: boolean;
    checkedAt: string;
    latencyMs: number | null;
    error: string | null;
    proxyConfigured: boolean;
    proxyUrlHost: string | null;
    inprocess: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/async-jobs", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setMetrics(data.metrics ?? null);
    setQueue(Array.isArray(data.queue) ? data.queue : []);
    setStatuses(Array.isArray(data.statuses) ? data.statuses : []);
    setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
    setCbOpen(Boolean(data.circuitBreaker?.open));
    setProvider(data.provider ?? null);
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
    const t = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(t);
  }, [load]);

  return (
    <AdminShell>
      <div className="mb-4 flex items-start justify-between gap-3">
        <AdminTitle
          title="Очередь отчётов"
          subtitle="async_jobs: статусы, p50/p95, ошибки, расход за 24ч"
        />
        <AdminBtn onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          Обновить
        </AdminBtn>
      </div>

      {alerts.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {alerts.map((a) => (
            <div key={a}>{a}</div>
          ))}
        </div>
      )}

      {cbOpen && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          Circuit breaker открыт — claim report kinds на паузе.
        </div>
      )}

      <div
        className={`mb-4 rounded-lg border p-3 text-sm ${
          provider?.ok
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-red-500/40 bg-red-500/10"
        }`}
      >
        <div className="font-medium">
          LLM из воркера:{" "}
          {provider == null
            ? "ещё не проверялся"
            : provider.ok
              ? "доступен"
              : "недоступен"}
        </div>
        {provider && (
          <div className="mt-1 opacity-80 space-y-0.5">
            <div>
              Проверка: {new Date(provider.checkedAt).toLocaleString("ru-RU")}
              {provider.latencyMs != null ? ` · ${provider.latencyMs} мс` : ""}
            </div>
            <div>
              Proxy:{" "}
              {provider.proxyConfigured
                ? provider.proxyUrlHost ?? "задан"
                : "не задан"}
              {" · "}
              in-process: {provider.inprocess ? "on" : "off"}
            </div>
            {provider.error ? <div>Ошибка: {provider.error}</div> : null}
          </div>
        )}
      </div>

      {metrics && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-lg border border-white/10 p-3">
            Очередь: <strong>{metrics.queueLen}</strong>
          </div>
          <div className="rounded-lg border border-white/10 p-3">
            Wait p50/p95: {fmtMs(metrics.p50WaitMs)} / {fmtMs(metrics.p95WaitMs)}
          </div>
          <div className="rounded-lg border border-white/10 p-3">
            Gen p50/p95: {fmtMs(metrics.p50GenMs)} / {fmtMs(metrics.p95GenMs)}
          </div>
          <div className="rounded-lg border border-white/10 p-3">
            ₽/сутки: <strong>{metrics.costRub24h.toFixed(2)}</strong>
            <div className="opacity-70">
              429 ретраи: {metrics.retries429_24h} · fail: {metrics.failed24h} ·
              needs_regen: {metrics.needsRegeneration24h}
            </div>
          </div>
        </div>
      )}

      <h2 className="mb-2 text-lg font-medium">Активные / QA</h2>
      <div className="mb-8 overflow-x-auto rounded-lg border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="opacity-70">
            <tr>
              <th className="p-2">kind</th>
              <th className="p-2">attempts</th>
              <th className="p-2">created</th>
              <th className="p-2">next</th>
              <th className="p-2">id</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((row) => (
              <tr key={row.id} className="border-t border-white/5">
                <td className="p-2">{row.kind}</td>
                <td className="p-2">{row.attempts}</td>
                <td className="p-2">{new Date(row.createdAt).toLocaleString("ru-RU")}</td>
                <td className="p-2">
                  {row.nextAttemptAt
                    ? new Date(row.nextAttemptAt).toLocaleString("ru-RU")
                    : "—"}
                </td>
                <td className="p-2 font-mono text-xs opacity-70">{row.id.slice(0, 8)}</td>
              </tr>
            ))}
            {queue.length === 0 && (
              <tr>
                <td className="p-3 opacity-60" colSpan={5}>
                  Пусто
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-lg font-medium">Статусы за 24ч</h2>
      <ul className="text-sm opacity-90 space-y-1">
        {statuses.map((s) => (
          <li key={`${s.kind}-${s.status}`}>
            {s.kind} · {s.status}: {s.count}
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
