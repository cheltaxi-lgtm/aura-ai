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
}

interface MaintenanceResult {
  scanned: number;
  reembedded: number;
  decayed: number;
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
      setResult({ scanned: data.scanned, reembedded: data.reembedded, decayed: data.decayed });
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
            <StatCard label="Добавлено вручную" value={stats.facts.manual} accent="text-aura-neon" />
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
              критических: {result.decayed}
            </p>
          ) : null}
          {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
        </div>
      </div>
    </AdminShell>
  );
}
