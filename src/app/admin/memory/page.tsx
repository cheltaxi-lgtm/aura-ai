"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminBtn, AdminTitle, StatCard } from "@/components/admin/AdminShell";

interface MemoryStats {
  facts: {
    total: number;
    manual: number;
    auto: number;
    critical: number;
    missingEmbedding: number;
    distinctUsers: number;
  };
  sessionMemories: {
    total: number;
    distinctUsers: number;
  };
  extraction: {
    pending: number;
    running: number;
    failed: number;
    completed24h: number;
    stored24h: number;
    groundingRejected24h: number;
    avgLagSeconds: number;
    oldestPendingSeconds: number;
  };
  productAnalytics: {
    scope: { eligibleUsers: number; excludesUnlimitedAndTestAccounts: boolean; containsContentOrPii: boolean };
    activation: { promptUsers: number; activatedUsers: number; ratePercent: number | null };
    feedback: {
      confirmed: number;
      changed: number;
      forgotten: number;
      dismissed: number;
      positive: number;
      negative: number;
      positivePercent: number | null;
      sampleSize: number;
    };
    adoption: {
      quietUsers: number;
      quietPercent: number | null;
      freshUsers: number;
      freshPercent: number | null;
    };
    injection: { events: number; users: number };
    retention: Array<{
      window: "d7" | "d30";
      eligible: number;
      retained: number;
      ratePercent: number | null;
    }>;
    commercialCohorts: Array<{
      cohortMonth: string;
      variant: string;
      sampleSize: number;
      convertedUsers: number;
      conversionRatePercent: number;
      revenueRub: number;
      arppuRub: number;
      ltv30dRub: number;
    }>;
    interpretation: string;
  };
}

interface MaintenanceResult {
  scanned: number;
  reembedded: number;
  decayed: number;
  sessionsPruned: number;
}

export default function AdminMemoryPage() {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MaintenanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/memory/stats")
      .then((r) => r.json())
      .then((d) => setStats(d.facts ? d : null))
      .catch(() => setError("Не удалось загрузить статистику"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const runMaintenance = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/memory/maintenance?limit=500", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setResult({
        scanned: data.scanned,
        reembedded: data.reembedded,
        decayed: data.decayed,
        sessionsPruned: data.sessionsPruned ?? 0,
      });
      load();
    } catch {
      setError("Не удалось запустить обслуживание памяти");
    } finally {
      setRunning(false);
    }
  };

  if (loading || !stats) {
    return (
      <AdminShell>
        <p className="text-gray-500">Загрузка…</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <AdminTitle
        title="Глобальная память"
        subtitle="Долгосрочные факты (user_facts) и сводки сеансов (session_memories) по всем пользователям"
      />

      <div className="grid max-w-5xl gap-6">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-400">Долгосрочные факты</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatCard label="Всего фактов" value={stats.facts.total} />
            <StatCard label="Добавлено вручную" value={stats.facts.manual} accent="text-aura-champagne" />
            <StatCard label="Извлечено автоматически" value={stats.facts.auto} />
            <StatCard label="Критические" value={stats.facts.critical} accent="text-amber-400" />
            <StatCard
              label="Без embedding"
              value={stats.facts.missingEmbedding}
              accent={stats.facts.missingEmbedding > 0 ? "text-red-400" : "text-white"}
            />
          </div>
          <p className="mt-2 text-xs text-gray-600">
            Пользователей с сохранёнными фактами: {stats.facts.distinctUsers}
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-400">Сводки сеансов</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatCard label="Всего сводок" value={stats.sessionMemories.total} />
            <StatCard label="Пользователей" value={stats.sessionMemories.distinctUsers} />
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-400">Очередь извлечения</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Ожидают" value={stats.extraction.pending} />
            <StatCard label="В работе" value={stats.extraction.running} />
            <StatCard
              label="Ошибки"
              value={stats.extraction.failed}
              accent={stats.extraction.failed > 0 ? "text-red-400" : "text-white"}
            />
            <StatCard label="Сохранено за 24ч" value={stats.extraction.stored24h} />
            <StatCard label="Завершено за 24ч" value={stats.extraction.completed24h} />
            <StatCard
              label="Grounding reject за 24ч"
              value={stats.extraction.groundingRejected24h}
            />
            <StatCard label="Средняя задержка, сек" value={stats.extraction.avgLagSeconds} />
            <StatCard
              label="Старейшая pending, сек"
              value={stats.extraction.oldestPendingSeconds}
              accent={stats.extraction.oldestPendingSeconds > 60 ? "text-amber-400" : "text-white"}
            />
          </div>
        </div>

        <div className="glass-panel p-6">
          <h2 className="mb-1 text-sm font-semibold text-gray-300">Продуктовая аналитика памяти</h2>
          <p className="mb-4 text-xs text-gray-600">
            Только агрегаты без содержимого памяти и PII. Unlimited- и тестовые аккаунты исключены.
            Все сравнения вариантов — наблюдаемая корреляция, не причинный эффект.
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label={`Активация (n=${stats.productAnalytics.activation.promptUsers})`}
              value={stats.productAnalytics.activation.ratePercent === null
                ? "—"
                : `${stats.productAnalytics.activation.ratePercent}%`}
              accent="text-aura-champagne"
            />
            <StatCard
              label={`Положительный feedback (n=${stats.productAnalytics.feedback.sampleSize})`}
              value={stats.productAnalytics.feedback.positivePercent === null
                ? "—"
                : `${stats.productAnalytics.feedback.positivePercent}%`}
            />
            <StatCard label="Подтверждено фактов" value={stats.productAnalytics.feedback.confirmed} />
            <StatCard label="Изменено фактов" value={stats.productAnalytics.feedback.changed} />
            <StatCard label="Забыто фактов" value={stats.productAnalytics.feedback.forgotten} />
            <StatCard label="Закрыто без действия" value={stats.productAnalytics.feedback.dismissed} />
            <StatCard
              label={`Тихий режим (n=${stats.productAnalytics.scope.eligibleUsers})`}
              value={stats.productAnalytics.adoption.quietPercent === null
                ? "—"
                : `${stats.productAnalytics.adoption.quietPercent}%`}
            />
            <StatCard
              label={`Свежий сеанс (n=${stats.productAnalytics.scope.eligibleUsers})`}
              value={stats.productAnalytics.adoption.freshPercent === null
                ? "—"
                : `${stats.productAnalytics.adoption.freshPercent}%`}
            />
            {stats.productAnalytics.retention.map((row) => (
              <StatCard
                key={row.window}
                label={`${row.window.toUpperCase()} retention (n=${row.eligible})`}
                value={row.ratePercent === null ? "—" : `${row.ratePercent}%`}
              />
            ))}
            <StatCard label="Memory injection events" value={stats.productAnalytics.injection.events} />
            <StatCard label="Пользователей с injection" value={stats.productAnalytics.injection.users} />
          </div>

          <div className="mt-6 overflow-x-auto">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              30-дневные когорты и варианты
            </h3>
            {stats.productAnalytics.commercialCohorts.length ? (
              <table className="min-w-full text-left text-xs text-gray-400">
                <thead className="border-b border-white/10 text-gray-500">
                  <tr>
                    <th className="p-2">Когорта</th><th className="p-2">Вариант</th>
                    <th className="p-2">n</th><th className="p-2">Конверсия</th>
                    <th className="p-2">Платящих</th><th className="p-2">ARPPU</th>
                    <th className="p-2">LTV 30д</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.productAnalytics.commercialCohorts.map((row) => (
                    <tr key={`${row.cohortMonth}:${row.variant}`} className="border-b border-white/5">
                      <td className="p-2">{row.cohortMonth}</td><td className="p-2">{row.variant}</td>
                      <td className="p-2">{row.sampleSize}</td>
                      <td className="p-2">{row.conversionRatePercent}%</td>
                      <td className="p-2">{row.convertedUsers}</td>
                      <td className="p-2">{row.arppuRub.toLocaleString("ru-RU")} ₽</td>
                      <td className="p-2">{row.ltv30dRub.toLocaleString("ru-RU")} ₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-xs text-gray-600">Пока нет зрелых 30-дневных когорт.</p>}
          </div>
          <p className="mt-3 text-[11px] text-amber-500/80">{stats.productAnalytics.interpretation}</p>
        </div>

        <div className="glass-panel p-6">
          <h2 className="mb-1 text-sm font-semibold text-gray-300">Обслуживание памяти</h2>
          <p className="mb-4 text-xs text-gray-600">
            Дозаполняет embedding у фактов, сохранённых пока провайдер эмбеддингов был недоступен, и
            понижает приоритет затихших «критических» фактов без даты события (&gt;120 дней без
            обновления). Тот же процесс каждую ночь выполняет cron.
          </p>
          <AdminBtn onClick={runMaintenance} disabled={running}>
            {running ? "Выполняется…" : "Запустить сейчас"}
          </AdminBtn>
          {result ? (
            <p className="mt-3 text-xs text-emerald-400">
              Просканировано: {result.scanned} · дозаполнено embedding: {result.reembedded} · понижено
              критических: {result.decayed} · удалено лишних сводок: {result.sessionsPruned}
            </p>
          ) : null}
          {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
        </div>
      </div>
    </AdminShell>
  );
}
